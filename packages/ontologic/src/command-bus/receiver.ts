import EventEmitter from "events";

import {
  type BusCommand,
  type CommandBusResponse,
  type CommandBusStatus,
  type CommandHandlerResponse,
  type CommandReceiver,
  type StopOptions,
} from "./interfaces";
import { commandBusMessageSchema } from "./schemas";
import { DEFAULT_STOP_TIMEOUT_MS, settlesWithin } from "./stopTimeout";
import {
  IDynamicPublisherConnector,
  IOrderedListenerConnector,
  ReceivedMessage,
} from "../bus-connectors";

export class CommandBusReceiver<
  Command extends BusCommand,
> implements CommandReceiver<Command> {
  public readonly name = "CommandBusReceiver";
  #status: CommandBusStatus = "STOPPED";
  #consumeCommands = false;

  #eventEmitter: EventEmitter;
  #commandSubscriber: IOrderedListenerConnector;
  #responsePublisher: IDynamicPublisherConnector;

  /** Every message still being handled: parse, handler, ack and reply. */
  #inFlight = new Set<Promise<void>>();
  /** Shared by concurrent `stop` calls while the drain is under way. */
  #stopping: Promise<void> | undefined;

  constructor(dependencies: {
    commandSubscriber: IOrderedListenerConnector;
    responsePublisher: IDynamicPublisherConnector;
  }) {
    this.#commandSubscriber = dependencies.commandSubscriber;
    this.#responsePublisher = dependencies.responsePublisher;

    this.#eventEmitter = new EventEmitter({ captureRejections: true });
  }

  /**
   * Method that checks the connection of the subscriber and publisher.
   *
   * @throws if one of their connection checks fails.
   * @returns true when everything passes
   */
  async checkConnection(): Promise<true> {
    await Promise.all([
      this.#commandSubscriber.checkConnection(),
      this.#responsePublisher.checkConnection(),
    ]);

    return true;
  }

  async process(
    commandHandler: (command: Command) => Promise<CommandHandlerResponse>,
  ) {
    this.#consumeCommands = true;

    this.#commandSubscriber.onMessage(async (message) => {
      if (this.#status === "STOPPING") {
        // Refused, not dropped: a nack hands the command back to the broker,
        // so another receiver can take it.
        await message.nack();

        return;
      }

      const handling = this.#handleMessage(commandHandler, message);

      this.#inFlight.add(handling);

      try {
        await handling;
      } finally {
        this.#inFlight.delete(handling);
      }
    });
  }

  async #handleMessage(
    commandHandler: (command: Command) => Promise<CommandHandlerResponse>,
    message: ReceivedMessage,
  ): Promise<void> {
    let parsedMessage: unknown;

    try {
      parsedMessage = JSON.parse(message.content);
    } catch (error: unknown) {
      await message.ack();

      this.#eventEmitter.emit(
        "failure",
        new Error("Invalid command: The command cannot be parsed as JSON", {
          cause: error,
        }),
      );

      return;
    }

    const parsedBusMessageResult =
      commandBusMessageSchema.safeParse<Command>(parsedMessage);

    if (parsedBusMessageResult.isErr()) {
      await message.ack();

      this.#eventEmitter.emit("failure", parsedBusMessageResult.error);

      return;
    }

    const { command, responseTopicName } = parsedBusMessageResult.value;

    let response: CommandBusResponse;

    // Only the handler is guarded here. Publishing the response is a separate
    // concern below, so that a broker failure is never reported as a command
    // handler failure.
    try {
      const handlerResult = await commandHandler(command);

      response = handlerResult.isErr()
        ? failureResponse(command.id, handlerResult.error, "COMMAND_REJECTED")
        : {
            commandId: command.id,
            result: "SUCCESS",
            payload: handlerResult.value,
          };
    } catch (err) {
      response = failureResponse(
        command.id,
        this.#handlerThrew(err),
        "HANDLER_THREW",
      );
    }

    // Acked exactly once, whatever the handler decided: a command that failed
    // must not be reprocessed.
    await message.ack();

    try {
      await this.#responsePublisher.publishTo({
        topicName: responseTopicName,
        message: JSON.stringify(response),
      });
    } catch (err) {
      // The command WAS handled, we just could not reply. Reporting is all
      // that is left to do, the emitter will time out on its side.
      this.#eventEmitter.emit(
        "failure",
        new Error(
          `${this.name}: Failed to publish the response of command ${command.id}`,
          { cause: err },
        ),
      );
    }
  }

  #handlerThrew(err: unknown): Error {
    if (err instanceof Error) {
      // Only the message is prefixed. The name, stack and any `code`/`context`
      // stay the thrower's, so the emitter sees where it actually broke.
      const wrapped = new Error(
        `${this.name}: Command handler threw: ${err.message}`,
        { cause: err },
      );

      wrapped.name = err.name;
      if (err.stack !== undefined) {
        wrapped.stack = err.stack;
      }

      const { code, context } = err as { code?: unknown; context?: unknown };

      Object.assign(wrapped, { code, context });

      return wrapped;
    }

    return new Error(`${this.name}: Command handler threw: a non Error object`);
  }

  async start() {
    if (this.#status === "STARTED") {
      return;
    }

    if (this.#status === "STOPPING") {
      throw new Error(`[${this.name}] Cannot start while stopping`);
    }

    if (!this.#consumeCommands) {
      throw new Error("No command handler has been registered");
    }

    await this.#responsePublisher.start();

    await this.#commandSubscriber.start();

    this.#status = "STARTED";
  }

  /**
   * Stops gracefully, like an HTTP server draining its connections.
   *
   * The command subscriber is stopped first, so no new command arrives, and
   * any that still does is nacked back to the broker. Commands already being
   * handled run to the end and their responses are still published: the
   * response publisher is stopped last, once nothing needs it.
   *
   * The drain is bounded by `options.timeout` (2 minutes by default), so a
   * handler that never returns cannot hold the shutdown forever. If the limit
   * hits, the abandoned commands are reported through `onError` and the
   * response publisher is stopped anyway. Those commands were not acked, so the
   * broker can deliver them again.
   *
   * A second call during the drain joins the first one, options included.
   */
  async stop(options?: StopOptions): Promise<void> {
    if (this.#status === "STOPPED") {
      return;
    }

    const timeout = options?.timeout ?? DEFAULT_STOP_TIMEOUT_MS;

    this.#stopping ??= this.#drainAndStop(timeout).finally(() => {
      this.#stopping = undefined;
    });

    return this.#stopping;
  }

  async #drainAndStop(timeout: number): Promise<void> {
    this.#status = "STOPPING";

    try {
      // The subscriber's own stop is inside the limit too: the Redis and SQS
      // listeners wait for the handler they are running before they return.
      const drain = (async () => {
        await this.#commandSubscriber.stop();
        await Promise.allSettled([...this.#inFlight]);
      })();

      // Observed here so a late subscriber failure after a forced stop is
      // reported rather than left unhandled.
      drain.catch((error: unknown) => {
        this.#eventEmitter.emit(
          "failure",
          new Error(`[${this.name}] Failed to stop the command subscriber`, {
            cause: error,
          }),
        );
      });

      const drained = await settlesWithin(drain, timeout);

      if (!drained) {
        this.#eventEmitter.emit(
          "failure",
          new Error(
            `[${this.name}] Stop timed out after ${timeout}ms: ${this.#inFlight.size} command(s) still being handled were abandoned`,
          ),
        );
      }

      await this.#responsePublisher.stop();

      this.#status = "STOPPED";
    } catch (error: unknown) {
      throw new Error(`[${this.name}] Failed to stop`, { cause: error });
    }
  }

  onError(errorHandler: (error: Error) => void) {
    this.#responsePublisher.onError(errorHandler);
    this.#commandSubscriber.onError(errorHandler);

    this.#eventEmitter.on("failure", (error: Error) => {
      errorHandler(error);
    });
  }

  status(): CommandBusStatus {
    return this.#status;
  }
}

/**
 * Turns a handler error into the wire shape `commandBusResponseSchema` accepts.
 *
 * `name`, `code` and `message` must be non-empty there, otherwise the emitter
 * drops the response and its caller waits out the full timeout instead of
 * getting the error. So every one of them has a fallback.
 *
 * `code` is the error's own `code` when it has one, else `defaultCode`, which
 * says how the handler failed. `context` is `DomainError`'s context. It has to
 * be JSON-serializable to cross the wire.
 */
function failureResponse(
  commandId: string,
  error: Error,
  defaultCode: "COMMAND_REJECTED" | "HANDLER_THREW",
): CommandBusResponse {
  const { code, context } = error as { code?: unknown; context?: unknown };

  return {
    commandId,
    result: "FAILURE",
    error: {
      name: nonEmpty(error.name, "Error"),
      code: nonEmpty(code, defaultCode),
      message: nonEmpty(
        error.message,
        "Command handler failed with no message",
      ),
      stack: error.stack ?? null,
      context: context ?? null,
    },
  };
}

function nonEmpty(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}
