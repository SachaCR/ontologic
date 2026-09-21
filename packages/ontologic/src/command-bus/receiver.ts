import EventEmitter from "events";

import {
  type BusCommand,
  type CommandBusResponse,
  type CommandBusStatus,
  type CommandHandlerResponse,
  type CommandReceiver,
} from "./interfaces";
import { commandBusMessageSchema } from "./schemas";
import {
  IDynamicPublisherConnector,
  IOrderedListenerConnector,
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
          ? failureResponse(command.id, handlerResult.error)
          : {
              commandId: command.id,
              result: "SUCCESS",
              payload: handlerResult.value,
            };
      } catch (err) {
        response = failureResponse(command.id, this.#handlerThrew(err));
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
    });
  }

  #handlerThrew(err: unknown): Error {
    if (err instanceof Error) {
      return new Error(`${this.name}: Command handler threw: ${err.message}`);
    }

    return new Error(`${this.name}: Command handler threw: a non Error object`);
  }

  async start() {
    if (this.#status === "STARTED") {
      return;
    }

    if (!this.#consumeCommands) {
      throw new Error("No command handler has been registered");
    }

    await this.#responsePublisher.start();

    await this.#commandSubscriber.start();

    this.#status = "STARTED";
  }

  async stop() {
    if (this.#status === "STOPPED") {
      return;
    }

    try {
      await this.#responsePublisher.stop();
      await this.#commandSubscriber.stop();

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

function failureResponse(commandId: string, error: Error): CommandBusResponse {
  return {
    commandId,
    result: "FAILURE",
    error: {
      name: error.name,
      code: "OOPS",
      message: error.message,
      stack: error.stack ?? null,
      context: null,
    },
  };
}
