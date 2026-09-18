import { describe, it, expect, vi } from "vitest";

import { CommandBusReceiver } from "../receiver";
import {
  type IDynamicPublisherConnector,
  type IOrderedListenerConnector,
  type ReceivedMessage,
} from "../connectors/interfaces";
import {
  type BusCommand,
  type CommandBusResponse,
  type CommandHandlerResponse,
} from "../interfaces";
import { err, ok } from "../../result";

function command(): BusCommand {
  return {
    id: "cmd-1",
    name: "PlaceOrder",
    payload: { orderId: "order-1" },
    metadata: null,
  };
}

function receivedMessage(data: unknown): ReceivedMessage {
  return {
    data,
    ack: vi.fn(),
    nack: vi.fn(),
  };
}

/**
 * Drives a receiver through a single message and returns everything the test
 * needs to assert on: the message it acked, what got published, and the errors
 * reported to `onError`.
 */
async function processOneMessage(params: {
  data: unknown;
  handler: (command: BusCommand) => Promise<CommandHandlerResponse>;
  publishFails?: Error;
}) {
  const published: { to: string; message: unknown }[] = [];

  const publish = vi.fn(async (args: { to: string; message: unknown }) => {
    if (params.publishFails) {
      throw params.publishFails;
    }

    published.push(args);
  });

  let handle: (message: ReceivedMessage) => Promise<void> = async () => {};

  const commandSubscriber = {
    status: "STOPPED",
    start: vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
    onError: vi.fn(),
    checkConnection: vi.fn(async () => true),
    onMessage: vi.fn((handler) => {
      handle = handler;
    }),
  } as unknown as IOrderedListenerConnector;

  const responsePublisher = {
    status: "STOPPED",
    start: vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
    onError: vi.fn(),
    checkConnection: vi.fn(async () => true),
    publish,
  } as unknown as IDynamicPublisherConnector;

  const receiver = new CommandBusReceiver<BusCommand>({
    commandSubscriber,
    responsePublisher,
  });

  const reportedErrors: Error[] = [];
  receiver.onError((error) => reportedErrors.push(error));

  receiver.process(params.handler);

  const message = receivedMessage(params.data);
  await handle(message);

  return { message, published, reportedErrors, publish };
}

const validData = {
  responseTopicName: "responses",
  command: command(),
};

describe("CommandBusReceiver.process", () => {
  it("publishes a SUCCESS response and acks once when the handler succeeds", async () => {
    const { message, published } = await processOneMessage({
      data: validData,
      handler: async () => ok({ ok: true }),
    });

    expect(message.ack).toHaveBeenCalledTimes(1);
    expect(published).toEqual([
      {
        to: "responses",
        message: {
          commandId: "cmd-1",
          result: "SUCCESS",
          payload: { ok: true },
        },
      },
    ]);
  });

  it("publishes a FAILURE response and acks once when the handler returns an error", async () => {
    const domainError = new Error("order already paid");
    domainError.name = "ORDER_ALREADY_PAID";

    const { message, published } = await processOneMessage({
      data: validData,
      handler: async () => err(domainError),
    });

    expect(message.ack).toHaveBeenCalledTimes(1);

    const response = published[0]?.message as CommandBusResponse;

    expect(response.result).toBe("FAILURE");
    expect(response).toMatchObject({
      commandId: "cmd-1",
      error: { name: "ORDER_ALREADY_PAID", message: "order already paid" },
    });
  });

  it("publishes a FAILURE response and acks once when the handler throws", async () => {
    const { message, published } = await processOneMessage({
      data: validData,
      handler: async () => {
        throw new Error("boom");
      },
    });

    expect(message.ack).toHaveBeenCalledTimes(1);

    const response = published[0]?.message as CommandBusResponse;

    expect(response).toMatchObject({
      commandId: "cmd-1",
      result: "FAILURE",
      error: {
        message: "CommandBusReceiver: Command handler threw: boom",
      },
    });
  });

  it("reports a non Error throw without leaking it", async () => {
    const { published } = await processOneMessage({
      data: validData,
      handler: async () => {
        throw "a string";
      },
    });

    const response = published[0]?.message as CommandBusResponse;

    expect(response).toMatchObject({
      result: "FAILURE",
      error: {
        message:
          "CommandBusReceiver: Command handler threw: a non Error object",
      },
    });
  });

  it("acks only once when publishing the response fails", async () => {
    const { message } = await processOneMessage({
      data: validData,
      handler: async () => ok({ ok: true }),
      publishFails: new Error("broker is down"),
    });

    expect(message.ack).toHaveBeenCalledTimes(1);
  });

  it("does not attempt to publish again when publishing the response fails", async () => {
    const { publish } = await processOneMessage({
      data: validData,
      handler: async () => ok({ ok: true }),
      publishFails: new Error("broker is down"),
    });

    expect(publish).toHaveBeenCalledTimes(1);
  });

  it("reports a publish failure as a publish failure, not a handler failure", async () => {
    const brokerError = new Error("broker is down");

    const { reportedErrors } = await processOneMessage({
      data: validData,
      handler: async () => ok({ ok: true }),
      publishFails: brokerError,
    });

    expect(reportedErrors).toHaveLength(1);
    expect(reportedErrors[0]?.message).toBe(
      "CommandBusReceiver: Failed to publish the response of command cmd-1",
    );
    expect(reportedErrors[0]?.cause).toBe(brokerError);
  });

  it("acks and reports without publishing when the message is invalid", async () => {
    const { message, published, reportedErrors } = await processOneMessage({
      data: { responseTopicName: "responses", command: { id: "" } },
      handler: async () => ok({ ok: true }),
    });

    expect(message.ack).toHaveBeenCalledTimes(1);
    expect(published).toEqual([]);
    expect(reportedErrors[0]?.message).toBe(
      "Invalid BusCommand: id is an empty string",
    );
  });
});
