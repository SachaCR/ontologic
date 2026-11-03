import EventEmitter from "events";

import {
  type BusCommand,
  type CommandBusResponse,
  type CommandBusStatus,
  type CommandEmitter,
  type CommandHandlerResponse,
  type CommandMap,
  type CommandResolver,
  type StopOptions,
} from "./interfaces";
import { busCommandSchema, commandBusResponseSchema } from "./schemas";
import { waitForTimeout } from "./timeout";
import { DEFAULT_STOP_TIMEOUT_MS, settlesWithin } from "./stopTimeout";
import { err, ok } from "../result";
import {
  IListenerConnector,
  IOrderedPublisherConnector,
  ReceivedMessage,
} from "../bus-connectors";

export class CommandBusEmitter<
  Command extends BusCommand,
> implements CommandEmitter<Command> {
  public readonly name = "CommandBusEmitter";
  #status: CommandBusStatus = "STOPPED";

  #defaultTimeout: number;
  #eventEmitter: EventEmitter;
  #responseSubscriber: IListenerConnector;
  #commandPublisher: IOrderedPublisherConnector;
  #commandMap: CommandMap;

  /** Every `send` call that has not returned yet, publish included. */
  #inFlight = new Set<Promise<CommandHandlerResponse>>();
  /** Shared by concurrent `stop` calls while the drain is under way. */
  #stopping: Promise<void> | undefined;

  constructor(
    dependencies: {
      commandPublisher: IOrderedPublisherConnector;
      responseSubscriber: IListenerConnector;
    },
    options: { timeout: number } = { timeout: 10000 },
  ) {
    this.#defaultTimeout = options.timeout;

    this.#commandPublisher = dependencies.commandPublisher;
    this.#responseSubscriber = dependencies.responseSubscriber;

    this.#eventEmitter = new EventEmitter({ captureRejections: true });

    this.#commandMap = new Map<string, CommandResolver>();
  }
  /**
   * Method that checks the connection of the subscriber and publisher.
   *
   * @throws if one of their connection checks fails.
   * @returns true when everything passes
   */
  async checkConnection(): Promise<true> {
    await Promise.all([
      this.#commandPublisher.checkConnection(),
      this.#responseSubscriber.checkConnection(),
    ]);

    return true;
  }

  async send(
    params: {
      command: Command;
      orderingKey: string;
    },
    options?: {
      timeout?: number;
    },
  ): Promise<CommandHandlerResponse> {
    if (this.#status === "STOPPING") {
      throw new Error("Command Bus Emitter is stopping");
    }

    if (this.#status === "STOPPED") {
      throw new Error("Command Bus Emitter is not started");
    }

    // Tracked so `stop` can wait for it. The promise covers the whole call, so
    // a command still being published counts as in flight too.
    const sending = this.#send(params, options);

    this.#inFlight.add(sending);

    try {
      return await sending;
    } finally {
      this.#inFlight.delete(sending);
    }
  }

  async #send(
    params: {
      command: Command;
      orderingKey: string;
    },
    options?: {
      timeout?: number;
    },
  ): Promise<CommandHandlerResponse> {
    const { command, orderingKey } = params;

    const validatedCommandResult = busCommandSchema.safeParse(command);

    if (validatedCommandResult.isErr()) {
      throw validatedCommandResult.error;
    }

    const timeout = options?.timeout ?? this.#defaultTimeout;

    if (this.#commandMap.has(command.id)) {
      throw new Error(
        `Command with id ${command.id} already in flight. Please use a unique command id for each command or wait for the first one to return or timeout. Or add await to your code...`,
      );
    }

    const commandPromise = new Promise<CommandBusResponse>((resolve) => {
      this.#commandMap.set(command.id, {
        resolve,
        startTime: new Date().getTime(),
      });
    });

    try {
      await this.#commandPublisher.publish(
        JSON.stringify({
          responseTopicName: this.#responseSubscriber.topicName(),
          command,
        }),
        {
          orderingKey,
        },
      );
    } catch (err) {
      this.#commandMap.delete(command.id);

      throw err;
    }

    const commandTimeout = waitForTimeout(timeout, command.id);

    let response: CommandBusResponse;

    try {
      response = await Promise.race([commandPromise, commandTimeout.promise]);
    } finally {
      // Always clear the timer, otherwise a command that answered quickly still
      // pins one for the full timeout.
      commandTimeout.cancel();

      this.#commandMap.delete(command.id);
    }

    if (response.result === "FAILURE") {
      const error = new Error(response.error.message);

      error.name = response.error.name;
      error.cause = response.error;

      if (response.error.stack) {
        error.stack = response.error.stack;
      }

      return err(error);
    }

    return ok(response.payload);
  }

  // WARNING: As this function is a callback executed in another context (line 61)
  // We must use an arrow function here or we will lose the context of `this` and commandMap will be undefined
  #responseHandler = async (message: ReceivedMessage) => {
    // response are volatile, it doesn't matter if we lose them.
    await message.ack();

    let parsedMessage: unknown;

    try {
      parsedMessage = JSON.parse(message.content);
    } catch (error: unknown) {
      this.#eventEmitter.emit(
        "failure",
        new Error("Invalid response: The response cannot be parsed as JSON", {
          cause: error,
        }),
      );
      return;
    }

    const parsedBusMessageResult =
      commandBusResponseSchema.safeParse(parsedMessage);

    if (parsedBusMessageResult.isErr()) {
      this.#eventEmitter.emit("failure", parsedBusMessageResult.error);
      return Promise.resolve();
    }

    const response: CommandBusResponse = parsedBusMessageResult.value;

    const resolver = this.#commandMap.get(response.commandId);

    if (!resolver) {
      this.#eventEmitter.emit(
        "failure",
        new Error(
          "Resolver not found: The response probably arrived too late and the command has timed out in between.",
        ),
      );

      return Promise.resolve();
    }

    resolver.resolve(response);

    return Promise.resolve();
  };

  async start() {
    if (this.#status === "STARTED") {
      return;
    }

    if (this.#status === "STOPPING") {
      throw new Error(`[${this.name}] Cannot start while stopping`);
    }

    this.#responseSubscriber.onMessage(this.#responseHandler);

    await this.#responseSubscriber.start();
    await this.#commandPublisher.start();

    this.#status = "STARTED";
  }

  /**
   * Stops gracefully, like an HTTP server draining its connections.
   *
   * New `send` calls are refused at once. Commands already in flight keep
   * waiting for their response, and the response subscriber stays up so it can
   * still deliver it. Each one is bounded by its own timeout, and the whole
   * drain by `options.timeout` (2 minutes by default). If that limit hits
   * first, the commands still waiting are settled with an `EMITTER_STOPPED`
   * failure and reported through `onError`. Either way, the connectors are
   * stopped last.
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

    const drained = await settlesWithin(
      Promise.allSettled([...this.#inFlight]),
      timeout,
    );

    if (!drained) {
      const abandoned = this.#commandMap.size;

      // Forced: nobody should be left waiting on a bus that is going away.
      // Each `send` clears its own entry from the map.
      for (const [commandId, resolver] of this.#commandMap) {
        resolver.resolve(emitterStoppedResponse(commandId, timeout));
      }

      this.#eventEmitter.emit(
        "failure",
        new Error(
          `[${this.name}] Stop timed out after ${timeout}ms: ${abandoned} command(s) still in flight were settled with EMITTER_STOPPED`,
        ),
      );
    }

    try {
      await this.#commandPublisher.stop();
      await this.#responseSubscriber.stop();
      this.#status = "STOPPED";
    } catch (error: unknown) {
      throw new Error(`[${this.name}] Failed to stop`, {
        cause: error,
      });
    }
  }

  onError(errorHandler: (error: Error) => void) {
    this.#responseSubscriber.onError(errorHandler);
    this.#commandPublisher.onError(errorHandler);

    this.#eventEmitter.on("failure", (error: Error) => {
      errorHandler(error);
    });
  }

  metrics() {
    return {
      inFlightCommands: this.#commandMap.size,
    };
  }

  status(): CommandBusStatus {
    return this.#status;
  }
}

/**
 * What a `send` still waiting resolves with when a forced stop gives up on it.
 *
 * Like a timeout, it says nothing about the command itself: it was published,
 * so a receiver may still handle it.
 */
function emitterStoppedResponse(
  commandId: string,
  stopTimeout: number,
): CommandBusResponse {
  const error = new Error(
    `The command bus emitter was stopped (stop timeout of ${stopTimeout}ms exceeded) before the command answered. Please verify if the command has been handled or not with idempotency mechanism.`,
  );

  error.name = "EMITTER_STOPPED_ERROR";

  return {
    commandId,
    result: "FAILURE",
    error: {
      name: error.name,
      code: "EMITTER_STOPPED",
      message: error.message,
      stack: error.stack ?? null,
      context: { commandId },
    },
  };
}
