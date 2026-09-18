import EventEmitter from "events";

import {
  type BusCommand,
  type CommandBusMessage,
  type CommandBusResponse,
  type CommandBusStatus,
  type CommandHandlerResponse,
  type CommandReceiver,
} from "./interfaces";
import {
  IDynamicPublisherConnector,
  IOrderedListenerConnector,
} from "./connectors/interfaces";

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

    this.#eventEmitter = new EventEmitter();
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

  process(
    commandHandler: (command: Command) => Promise<CommandHandlerResponse>,
  ) {
    this.#consumeCommands = true;

    this.#commandSubscriber.onMessage(async (message) => {
      const busMessage = message.data as CommandBusMessage<Command>;

      const parsedBusMessageResult = busCommandSchema.safeParse(
        busMessage.command,
      );

      if (parsedBusMessageResult.error) {
        message.ack();

        this.#eventEmitter.emit("error", parsedBusMessageResult.error);

        return;
      }

      const { command, responseTopicName } = busMessage;

      try {
        const response = await commandHandler(command);
        message.ack();

        if (response.isErr()) {
          const error = response.error;

          const messageToPublish: CommandBusResponse = {
            commandId: command.id,
            result: "FAILURE",
            error: {
              name: error.name,
              code: "OOPS",
              message: error.message,
              stack: error.stack ?? null,
              context: null,
            },
          };

          await this.#responsePublisher.publish({
            to: responseTopicName,
            message: JSON.stringify(messageToPublish),
          });

          return;
        }

        await this.#responsePublisher.publish({
          to: responseTopicName,
          message: JSON.stringify({
            commandId: command.id,
            result: "SUCCESS",
            payload: response.value,
          }),
        });
      } catch (err) {
        message.ack(); // We don't want to reprocess a command that fails.

        let error: Error;

        if (err instanceof Error) {
          error = new Error(
            `${this.name}: Command handler threw: ${err.message}`,
          );
        } else {
          error = new Error(
            `${this.name}: Command handler threw: a non Error object`,
          );
        }

        const messageToPublish: CommandBusResponse = {
          commandId: command.id,
          result: "FAILURE",
          error: {
            name: error.name,
            code: "OOPS",
            message: error.message,
            stack: error.stack ?? null,
            context: null,
          },
        };

        await this.#responsePublisher.publish({
          to: responseTopicName,
          message: JSON.stringify(messageToPublish),
        });
      }
    });
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

    this.#eventEmitter.on("error", (error: Error) => {
      errorHandler(error);
    });
  }

  status(): CommandBusStatus {
    return this.#status;
  }
}
