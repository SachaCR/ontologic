import { describe, it, expect } from "vitest";

import {
  type BusCommand,
  type CommandBusMessage,
  type CommandBusResponse,
} from "../interfaces";
import {
  busCommandSchema,
  commandBusMessageSchema,
  commandBusResponseSchema,
} from "../schemas";
import { waitForTimeout } from "../timeout";

function command(overrides?: Record<string, unknown>): BusCommand {
  return {
    id: "cmd-1",
    name: "PlaceOrder",
    payload: { orderId: "order-1" },
    metadata: { correlationId: "corr-1" },
    ...overrides,
  } as BusCommand;
}

function successResponse(
  overrides?: Record<string, unknown>,
): CommandBusResponse {
  return {
    commandId: "cmd-1",
    result: "SUCCESS",
    payload: { orderId: "order-1" },
    ...overrides,
  } as CommandBusResponse;
}

function failureResponse(
  errorOverrides?: Record<string, unknown>,
): CommandBusResponse {
  return {
    commandId: "cmd-1",
    result: "FAILURE",
    error: {
      name: "Error",
      code: "OOPS",
      message: "Command handler threw",
      stack: "Error: Command handler threw\n    at <anonymous>",
      context: null,
      ...errorOverrides,
    },
  } as CommandBusResponse;
}

function busMessage(
  overrides?: Record<string, unknown>,
): CommandBusMessage<BusCommand> {
  return {
    responseTopicName: "responses",
    command: command(),
    ...overrides,
  } as CommandBusMessage<BusCommand>;
}

describe("busCommandSchema", () => {
  it("returns the same object when validation succeeds", () => {
    const input = command();

    expect(busCommandSchema.safeParse(input)._unsafeUnwrap()).toBe(input);
  });

  it("accepts a null payload and a null metadata", () => {
    const input = command({ payload: null, metadata: null });

    expect(busCommandSchema.safeParse(input).isOk()).toBe(true);
  });

  it("accepts an undefined payload as long as the key is present", () => {
    const input = { id: "a", name: "b", payload: undefined, metadata: null };

    expect(busCommandSchema.safeParse(input).isOk()).toBe(true);
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["a string", '{"id":"a"}'],
    ["a number", 42],
    ["an array", []],
  ])("rejects %s", (_label, input) => {
    const result = busCommandSchema.safeParse(input);

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().message).toBe(
      "Invalid BusCommand: not an object",
    );
  });

  it.each([
    [
      "id is missing",
      { id: undefined },
      "Invalid BusCommand: id is not a string",
    ],
    ["id is not a string", { id: 1 }, "Invalid BusCommand: id is not a string"],
    ["id is empty", { id: "" }, "Invalid BusCommand: id is an empty string"],
    [
      "name is missing",
      { name: undefined },
      "Invalid BusCommand: name is not a string",
    ],
    [
      "name is empty",
      { name: "" },
      "Invalid BusCommand: name is an empty string",
    ],
  ])("rejects a command whose %s", (_label, overrides, message) => {
    const result = busCommandSchema.safeParse(command(overrides));

    expect(result._unsafeUnwrapErr().message).toBe(message);
  });

  it("rejects a command with no payload key", () => {
    const result = busCommandSchema.safeParse({
      id: "a",
      name: "b",
      metadata: null,
    });

    expect(result._unsafeUnwrapErr().message).toBe(
      "Invalid BusCommand: payload is missing",
    );
  });

  it("rejects a command with no metadata key", () => {
    const result = busCommandSchema.safeParse({
      id: "a",
      name: "b",
      payload: null,
    });

    expect(result._unsafeUnwrapErr().message).toBe(
      "Invalid BusCommand: metadata is missing",
    );
  });
});

describe("commandBusResponseSchema", () => {
  it("returns the same object for a SUCCESS response", () => {
    const input = successResponse();

    expect(commandBusResponseSchema.safeParse(input)._unsafeUnwrap()).toBe(
      input,
    );
  });

  it("returns the same object for a FAILURE response", () => {
    const input = failureResponse();

    expect(commandBusResponseSchema.safeParse(input)._unsafeUnwrap()).toBe(
      input,
    );
  });

  it("accepts a SUCCESS response with an undefined payload", () => {
    const input = successResponse({ payload: undefined });

    expect(commandBusResponseSchema.safeParse(input).isOk()).toBe(true);
  });

  it("accepts a FAILURE response with a null stack", () => {
    const input = failureResponse({ stack: null });

    expect(commandBusResponseSchema.safeParse(input).isOk()).toBe(true);
  });

  it("accepts what waitForTimeout produces", async () => {
    const timedOut = await waitForTimeout(1, "cmd-1").promise;

    expect(commandBusResponseSchema.safeParse(timedOut).isOk()).toBe(true);
  });

  it.each([
    ["null", null],
    ["a JSON string", '{"commandId":"cmd-1","result":"SUCCESS","payload":1}'],
  ])("rejects %s", (_label, input) => {
    const result = commandBusResponseSchema.safeParse(input);

    expect(result._unsafeUnwrapErr().message).toBe(
      "Invalid CommandBusResponse: not an object",
    );
  });

  it.each([
    ["missing", undefined],
    ["not a string", 1],
  ])("rejects a response whose commandId is %s", (_label, commandId) => {
    const result = commandBusResponseSchema.safeParse(
      successResponse({ commandId }),
    );

    expect(result._unsafeUnwrapErr().message).toBe(
      "Invalid CommandBusResponse: commandId is not a string",
    );
  });

  it("rejects a response whose commandId is empty", () => {
    const result = commandBusResponseSchema.safeParse(
      successResponse({ commandId: "" }),
    );

    expect(result._unsafeUnwrapErr().message).toBe(
      "Invalid CommandBusResponse: commandId is an empty string",
    );
  });

  it.each([
    ["missing", undefined],
    ["unknown", "PENDING"],
    ["lowercase", "success"],
  ])("rejects a response whose result is %s", (_label, resultValue) => {
    const result = commandBusResponseSchema.safeParse(
      successResponse({ result: resultValue }),
    );

    expect(result._unsafeUnwrapErr().message).toBe(
      'Invalid CommandBusResponse: result must be "SUCCESS" or "FAILURE"',
    );
  });

  it("rejects a SUCCESS response with no payload key", () => {
    const result = commandBusResponseSchema.safeParse({
      commandId: "cmd-1",
      result: "SUCCESS",
    });

    expect(result._unsafeUnwrapErr().message).toBe(
      "Invalid CommandBusResponse: payload is missing",
    );
  });

  it("rejects a FAILURE response with no error object", () => {
    const result = commandBusResponseSchema.safeParse({
      commandId: "cmd-1",
      result: "FAILURE",
    });

    expect(result._unsafeUnwrapErr().message).toBe(
      "Invalid CommandBusResponse: error is not an object",
    );
  });

  it.each([
    ["name", "Invalid CommandBusResponse.error: name is not a string"],
    ["code", "Invalid CommandBusResponse.error: code is not a string"],
    ["message", "Invalid CommandBusResponse.error: message is not a string"],
  ])("rejects a FAILURE response whose error.%s is missing", (key, message) => {
    const result = commandBusResponseSchema.safeParse(
      failureResponse({ [key]: undefined }),
    );

    expect(result._unsafeUnwrapErr().message).toBe(message);
  });

  it("rejects a FAILURE response whose error.stack is undefined", () => {
    const result = commandBusResponseSchema.safeParse(
      failureResponse({ stack: undefined }),
    );

    expect(result._unsafeUnwrapErr().message).toBe(
      "Invalid CommandBusResponse.error: stack is neither a string or null",
    );
  });

  it("rejects a FAILURE response with no error.context key", () => {
    const result = commandBusResponseSchema.safeParse({
      commandId: "cmd-1",
      result: "FAILURE",
      error: { name: "Error", code: "OOPS", message: "boom", stack: null },
    });

    expect(result._unsafeUnwrapErr().message).toBe(
      "Invalid CommandBusResponse.error: context is missing",
    );
  });
});

describe("commandBusMessageSchema", () => {
  it("returns the same object when validation succeeds", () => {
    const input = busMessage();

    expect(commandBusMessageSchema.safeParse(input)._unsafeUnwrap()).toBe(
      input,
    );
  });

  it("rejects a non object", () => {
    const result = commandBusMessageSchema.safeParse(null);

    expect(result._unsafeUnwrapErr().message).toBe(
      "Invalid CommandBusMessage: not an object",
    );
  });

  it.each([
    ["missing", undefined],
    ["not a string", 1],
  ])("rejects a message whose responseTopicName is %s", (_label, topic) => {
    const result = commandBusMessageSchema.safeParse(
      busMessage({ responseTopicName: topic }),
    );

    expect(result._unsafeUnwrapErr().message).toBe(
      "Invalid CommandBusMessage: responseTopicName is not a string",
    );
  });

  it("rejects a message whose responseTopicName is empty", () => {
    const result = commandBusMessageSchema.safeParse(
      busMessage({ responseTopicName: "" }),
    );

    expect(result._unsafeUnwrapErr().message).toBe(
      "Invalid CommandBusMessage: responseTopicName is an empty string",
    );
  });

  it("surfaces the busCommandSchema error when the nested command is invalid", () => {
    const result = commandBusMessageSchema.safeParse(
      busMessage({ command: command({ id: "" }) }),
    );

    expect(result._unsafeUnwrapErr().message).toBe(
      "Invalid BusCommand: id is an empty string",
    );
  });

  it("rejects a message with no command", () => {
    const result = commandBusMessageSchema.safeParse({
      responseTopicName: "responses",
    });

    expect(result._unsafeUnwrapErr().message).toBe(
      "Invalid BusCommand: not an object",
    );
  });
});
