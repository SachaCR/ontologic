import { err, ok, type Result } from "../result";
import {
  type BusCommand,
  type CommandBusMessage,
  type CommandBusResponse,
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
 * They never call `JSON.parse`. Deserialization belongs to the connector, these
 * schemas only ever see already decoded values.
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(
  record: Record<string, unknown>,
  key: string,
  shape: string,
): Error | null {
  const value = record[key];

  if (typeof value !== "string") {
    return new Error(`Invalid ${shape}: ${key} is not a string`);
  }

  if (value.length === 0) {
    return new Error(`Invalid ${shape}: ${key} is an empty string`);
  }

  return null;
}

export const busCommandSchema = {
  /**
   * Validates the `BusCommand` envelope: `id`, `name`, and the presence of
   * `payload` and `metadata`.
   *
   * `payload` and `metadata` are typed `unknown`, so only their presence is
   * checked, any value passes.
   *
   * WARNING: The `Command` type parameter is structural trust, not a check.
   * This package cannot know a caller's concrete command subtype, exactly like
   * the event bus, which asks the caller for an `(event: unknown) => Event`
   * validator rather than guessing. Validate your own payload before or after
   * this call.
   */
  safeParse<Command extends BusCommand>(
    input: unknown,
  ): Result<Command, Error> {
    const shape = "BusCommand";

    if (!isRecord(input)) {
      return err(new Error(`Invalid ${shape}: not an object`));
    }

    const idError = nonEmptyString(input, "id", shape);

    if (idError) {
      return err(idError);
    }

    const nameError = nonEmptyString(input, "name", shape);

    if (nameError) {
      return err(nameError);
    }

    if (!("payload" in input)) {
      return err(new Error(`Invalid ${shape}: payload is missing`));
    }

    if (!("metadata" in input)) {
      return err(new Error(`Invalid ${shape}: metadata is missing`));
    }

    return ok(input as Command);
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
   * command itself plus the topic its response must be published back to.
   *
   * The same structural trust warning as `busCommandSchema.safeParse` applies
   * to the `Command` type parameter.
   */
  safeParse<Command extends BusCommand>(
    input: unknown,
  ): Result<CommandBusMessage<Command>, Error> {
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

    return ok(input as unknown as CommandBusMessage<Command>);
  },
};
