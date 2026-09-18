import { Result } from "../result";

export type CommandBusStatus = "STOPPED" | "STARTED";

/**
 * This interface describes the structure of a command. A command is a message that contains a name and a payload.
 * The payload must be serializable to JSON.
 */
export interface BusCommand {
  id: string;
  name: string;
  payload: unknown;
  metadata: unknown;
}

export interface CommandBusMessage<Command extends BusCommand> {
  responseTopicName: string;
  command: Command;
}

export interface CommandEmitter<Command extends BusCommand> {
  send(
    params: {
      command: Command;
      orderingKey: string;
    },
    options?: {
      timeout?: number;
    },
  ): Promise<CommandHandlerResponse>;

  start(): Promise<void>;
  stop(): Promise<void>;
  onError(errorHandler: (error: Error) => void): void;
  metrics(): CommandBusMetrics;
  status(): CommandBusStatus;
  checkConnection(): Promise<boolean>;
}

export interface CommandReceiver<Command extends BusCommand> {
  process(
    commandHandler: (command: Command) => Promise<CommandHandlerResponse>,
  ): void;

  start(): Promise<void>;
  stop(): Promise<void>;
  onError(errorHandler: (error: Error) => void): void;
  status(): CommandBusStatus;
  checkConnection(): Promise<boolean>;
}

/**
 * This type describe the possible responses of a command. If the command handler is successful, the response will contain the payload and the commandId.
 * If the command handler throws or takes too long, the response will contain the error and the commandId.
 */
export type CommandBusResponse =
  | {
      commandId: string;
      result: "SUCCESS";
      payload: unknown;
    }
  | {
      result: "FAILURE";
      commandId: string;
      error: {
        name: string;
        code: string;
        message: string;
        context: unknown;
        stack: string | null;
      };
    };

export type CommandHandlerResponse = Result<unknown, Error>;

export type CommandMap = Map<string, CommandResolver>;

export interface CommandResolver {
  startTime: number;
  resolve: (value: CommandBusResponse) => void;
  reject: (error: CommandBusResponse) => void;
}

export interface CommandBusMetrics {
  inFlightCommands: number;
}

export interface BusMessage {
  /**
   * The payload of the message.
   */
  data: unknown;
  ack: () => void;

  /**
   * Rejects the message, indicating a failure in processing.
   */
  nack: () => void;
}
