import { Result } from "../result";
import {
  type BusComponent,
  type MessageMetadata,
  type StopOptions,
} from "../messaging";

/**
 * What a command must look like to cross the bus: a name and a JSON
 * serializable payload, nothing else.
 *
 * The use-case `Command` class satisfies it as it is, so the command a use case
 * takes is the command the bus carries. Plain objects work too.
 */
export interface BusCommand {
  name: string;
  payload: unknown;
}

/**
 * Travels next to every command, the same way `EventMetadata` travels next to
 * every event. `id` is unique per command: the emitter matches the response on
 * it, and handlers should use it for idempotency.
 *
 * Extend it for extra fields, such as a correlation id, and pass your type as
 * the `Metadata` parameter of the emitter, receiver and handler.
 */
export type CommandMetadata = MessageMetadata;

/** The envelope on the command topic. Mirrors the event bus `{ event, metadata }`. */
export interface CommandBusMessage<
  Command extends BusCommand,
  Metadata extends CommandMetadata = CommandMetadata,
> {
  command: Command;
  metadata: Metadata;
  responseTopicName: string;
}

/** Mirrors `EventHandler`: the command, then its metadata. */
export type CommandHandler<
  Command extends BusCommand,
  Metadata extends CommandMetadata = CommandMetadata,
> = (command: Command, metadata: Metadata) => Promise<CommandHandlerResponse>;

export interface CommandEmitter<
  Command extends BusCommand,
  Metadata extends CommandMetadata = CommandMetadata,
> extends BusComponent {
  send(
    params: {
      command: Command;
      metadata: Metadata;
      orderingKey: string;
    },
    options?: {
      timeout?: number;
    },
  ): Promise<CommandHandlerResponse>;

  stop(options?: StopOptions): Promise<void>;
  metrics(): CommandBusMetrics;
}

export interface CommandReceiver<
  Command extends BusCommand,
  Metadata extends CommandMetadata = CommandMetadata,
> extends BusComponent {
  process(commandHandler: CommandHandler<Command, Metadata>): void;

  stop(options?: StopOptions): Promise<void>;
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
}

export interface CommandBusMetrics {
  inFlightCommands: number;
}
