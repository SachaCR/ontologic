import { err, ok, type Result } from "../result";
import {
  isRecord,
  nonEmptyString,
  validateMessageMetadata,
} from "../messaging/wireGuards";
import {
  type BusCommand,
  type CommandBusMessage,
  type CommandBusResponse,
  type CommandMetadata,
} from "./interfaces";

/**
 * Schemas for the command bus wire boundary.
 *
 * They follow the same contract as `validateMetadata`: `unknown` in, a typed
 * value out, and the input object itself is returned on success. The only
 * difference is the failure channel, they return an `Err` instead of throwing,
 * because both call sites need to keep going on a malformed message rather than
 * unwind.
 *
 * They never call `JSON.parse`. Deserialization belongs to the caller, these
 * schemas only ever see already decoded values.
 */

export const busCommandSchema = {
  /**
   * Validates the `BusCommand` shape: a non-empty `name` and the presence of a
   * `payload`. Any payload value passes, it is typed `unknown`.
   *
   * WARNING: The `Command` type parameter is structural trust, not a check.
   * The receiver takes a `(command: unknown) => Command` validator for that,
   * exactly like the event bus listener.
   */
  safeParse<Command extends BusCommand>(
    input: unknown,
  ): Result<Command, Error> {
    const shape = "BusCommand";

    // A use-case `Command` is a class instance whose fields are getters, so
    // this reads through them rather than requiring own properties.
    if (!isRecord(input)) {
      return err(new Error(`Invalid ${shape}: not an object`));
    }

    const nameError = nonEmptyString(input, "name", shape);

    if (nameError) {
      return err(nameError);
    }

    if (!("payload" in input)) {
      return err(new Error(`Invalid ${shape}: payload is missing`));
    }

    return ok(input as unknown as Command);
  },
};

export const commandBusResponseSchema = {
  /**
   * Validates a `CommandBusResponse`, the discriminated union published back to
   * the emitter on the response topic. The producers are
   * `CommandBusReceiver.process` and `waitForTimeout`.
   */
  safeParse(input: unknown): Result<CommandBusResponse, Error> {
    const shape = "CommandBusResponse";

    if (!isRecord(input)) {
      return err(new Error(`Invalid ${shape}: not an object`));
    }

    const commandIdError = nonEmptyString(input, "commandId", shape);

    if (commandIdError) {
      return err(commandIdError);
    }

    if (input["result"] === "SUCCESS") {
      if (!("payload" in input)) {
        return err(new Error(`Invalid ${shape}: payload is missing`));
      }

      return ok(input as CommandBusResponse);
    }

    if (input["result"] !== "FAILURE") {
      return err(
        new Error(`Invalid ${shape}: result must be "SUCCESS" or "FAILURE"`),
      );
    }

    const error = input["error"];

    if (!isRecord(error)) {
      return err(new Error(`Invalid ${shape}: error is not an object`));
    }

    for (const key of ["name", "code", "message"]) {
      const errorFieldError = nonEmptyString(error, key, `${shape}.error`);

      if (errorFieldError) {
        return err(errorFieldError);
      }
    }

    // `stack` is `string | null`, never `undefined`: every producer writes
    // `error.stack ?? null`.
    if (typeof error["stack"] !== "string" && error["stack"] !== null) {
      return err(
        new Error(`Invalid ${shape}.error: stack is neither a string or null`),
      );
    }

    if (!("context" in error)) {
      return err(new Error(`Invalid ${shape}.error: context is missing`));
    }

    return ok(input as CommandBusResponse);
  },
};

export const commandBusMessageSchema = {
  /**
   * Validates the envelope the emitter publishes on the command topic: the
   * command, its metadata, and the topic its response must be published to.
   *
   * The same structural trust warning as `busCommandSchema.safeParse` applies
   * to the `Command` and `Metadata` type parameters.
   */
  safeParse<
    Command extends BusCommand,
    Metadata extends CommandMetadata = CommandMetadata,
  >(input: unknown): Result<CommandBusMessage<Command, Metadata>, Error> {
    const shape = "CommandBusMessage";

    if (!isRecord(input)) {
      return err(new Error(`Invalid ${shape}: not an object`));
    }

    const responseTopicNameError = nonEmptyString(
      input,
      "responseTopicName",
      shape,
    );

    if (responseTopicNameError) {
      return err(responseTopicNameError);
    }

    const commandResult = busCommandSchema.safeParse<Command>(input["command"]);

    if (commandResult.isErr()) {
      return err(commandResult.error);
    }

    const metadataResult = validateMessageMetadata(input["metadata"]);

    if (metadataResult.isErr()) {
      return err(metadataResult.error);
    }

    return ok(input as unknown as CommandBusMessage<Command, Metadata>);
  },
};
