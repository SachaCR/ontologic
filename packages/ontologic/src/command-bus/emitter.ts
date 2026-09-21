import EventEmitter from "events";

import {
  type BusCommand,
  type CommandBusResponse,
  type CommandBusStatus,
  type CommandEmitter,
  type CommandHandlerResponse,
  type CommandMap,
  type CommandResolver,
} from "./interfaces";
import { busCommandSchema, commandBusResponseSchema } from "./schemas";
import { waitForTimeout } from "./timeout";
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
    if (this.#status === "STOPPED") {
      throw new Error("Command Bus Emitter is not started");
    }

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

    const commandPromise = new Promise<CommandBusResponse>(
      (resolve, reject) => {
        this.#commandMap.set(command.id, {
          resolve,
          reject,
          startTime: new Date().getTime(),
        });
      },
    );

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

    this.#responseSubscriber.onMessage(this.#responseHandler);

    await this.#responseSubscriber.start();
    await this.#commandPublisher.start();

    this.#status = "STARTED";
  }

  async stop() {
    if (this.#status === "STOPPED") {
      return;
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
