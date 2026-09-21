import { describe, it, expect, vi } from "vitest";

import { CommandBusReceiver } from "../receiver";
import {
  type IDynamicPublisherConnector,
  type IOrderedListenerConnector,
  type ReceivedMessage,
} from "../../bus-connectors";
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

function receivedMessage(content: string): ReceivedMessage {
  return {
    content,
    ack: vi.fn(async () => {}),
    nack: vi.fn(async () => {}),
  };
}

/** Connectors carry strings, so every published response has to be parsed back. */
function parseResponse(message: string | undefined): CommandBusResponse {
  if (message === undefined) {
    throw new Error("Nothing was published");
  }

  return JSON.parse(message) as CommandBusResponse;
}

/**
 * Drives a receiver through a single message and returns everything the test
 * needs to assert on: the message it acked, what got published, and the errors
 * reported to `onError`.
 *
 * The two connectors below are typed as the interfaces rather than cast to
 * them. An earlier version used `as unknown as`, which is exactly why this file
 * kept compiling against a contract that no longer existed.
 */
async function processOneMessage(params: {
  content: string;
  handler: (command: BusCommand) => Promise<CommandHandlerResponse>;
  publishFails?: Error;
}) {
  const published: { topicName: string; message: string }[] = [];

  const publishTo = vi.fn(
    async (args: { topicName: string; message: string }): Promise<void> => {
      if (params.publishFails) {
        throw params.publishFails;
      }

      published.push(args);
    },
  );

  let handle: (message: ReceivedMessage) => Promise<void> = async () => {};

  const commandSubscriber: IOrderedListenerConnector = {
    status: "STOPPED",
    start: async () => {},
    stop: async () => {},
    onError: () => {},
    checkConnection: async () => true,
    topicName: () => "commands",
    onMessage: (handler) => {
      handle = handler;
    },
  };

  const responsePublisher: IDynamicPublisherConnector = {
    status: "STOPPED",
    start: async () => {},
    stop: async () => {},
    onError: () => {},
    checkConnection: async () => true,
    publishTo,
  };

  const receiver = new CommandBusReceiver<BusCommand>({
    commandSubscriber,
    responsePublisher,
  });

  const reportedErrors: Error[] = [];
  receiver.onError((error) => reportedErrors.push(error));

  receiver.process(params.handler);

  const message = receivedMessage(params.content);
  await handle(message);

  return { message, published, reportedErrors, publishTo };
}

const validContent = JSON.stringify({
  responseTopicName: "responses",
  command: command(),
});

describe("CommandBusReceiver.process", () => {
  it("publishes a SUCCESS response and acks once when the handler succeeds", async () => {
    const { message, published } = await processOneMessage({
      content: validContent,
      handler: async () => ok({ ok: true }),
    });

    expect(message.ack).toHaveBeenCalledTimes(1);
    expect(published).toHaveLength(1);
    expect(published[0]?.topicName).toBe("responses");
    expect(parseResponse(published[0]?.message)).toEqual({
      commandId: "cmd-1",
      result: "SUCCESS",
      payload: { ok: true },
    });
  });

  it("hands the handler the deserialized command", async () => {
    const seen: BusCommand[] = [];

    await processOneMessage({
      content: validContent,
      handler: async (received) => {
        seen.push(received);
        return ok(null);
      },
    });

    expect(seen).toEqual([command()]);
  });

  it("publishes a FAILURE response and acks once when the handler returns an error", async () => {
    const domainError = new Error("order already paid");
    domainError.name = "ORDER_ALREADY_PAID";

    const { message, published } = await processOneMessage({
      content: validContent,
      handler: async () => err(domainError),
    });

    expect(message.ack).toHaveBeenCalledTimes(1);

    const response = parseResponse(published[0]?.message);

    expect(response.result).toBe("FAILURE");
    expect(response).toMatchObject({
      commandId: "cmd-1",
      error: { name: "ORDER_ALREADY_PAID", message: "order already paid" },
    });
  });

  it("publishes a FAILURE response and acks once when the handler throws", async () => {
    const { message, published } = await processOneMessage({
      content: validContent,
      handler: async () => {
        throw new Error("boom");
      },
    });

    expect(message.ack).toHaveBeenCalledTimes(1);

    expect(parseResponse(published[0]?.message)).toMatchObject({
      commandId: "cmd-1",
      result: "FAILURE",
      error: {
        message: "CommandBusReceiver: Command handler threw: boom",
      },
    });
  });

  it("reports a non Error throw without leaking it", async () => {
    const { published } = await processOneMessage({
      content: validContent,
      handler: async () => {
        throw "a string";
      },
    });

    expect(parseResponse(published[0]?.message)).toMatchObject({
      result: "FAILURE",
      error: {
        message:
          "CommandBusReceiver: Command handler threw: a non Error object",
      },
    });
  });

  it("acks only once when publishing the response fails", async () => {
    const { message } = await processOneMessage({
      content: validContent,
      handler: async () => ok({ ok: true }),
      publishFails: new Error("broker is down"),
    });

    expect(message.ack).toHaveBeenCalledTimes(1);
  });

  it("does not attempt to publish again when publishing the response fails", async () => {
    const { publishTo } = await processOneMessage({
      content: validContent,
      handler: async () => ok({ ok: true }),
      publishFails: new Error("broker is down"),
    });

    expect(publishTo).toHaveBeenCalledTimes(1);
  });

  it("reports a publish failure as a publish failure, not a handler failure", async () => {
    const brokerError = new Error("broker is down");

    const { reportedErrors } = await processOneMessage({
      content: validContent,
      handler: async () => ok({ ok: true }),
      publishFails: brokerError,
    });

    expect(reportedErrors).toHaveLength(1);
    expect(reportedErrors[0]?.message).toBe(
      "CommandBusReceiver: Failed to publish the response of command cmd-1",
    );
    expect(reportedErrors[0]?.cause).toBe(brokerError);
  });

  it("acks and reports without publishing when the command fails validation", async () => {
    const { message, published, reportedErrors } = await processOneMessage({
      content: JSON.stringify({
        responseTopicName: "responses",
        command: { id: "", name: "PlaceOrder", payload: null, metadata: null },
      }),
      handler: async () => ok({ ok: true }),
    });

    expect(message.ack).toHaveBeenCalledTimes(1);
    expect(published).toEqual([]);
    expect(reportedErrors[0]?.message).toBe(
      "Invalid BusCommand: id is an empty string",
    );
  });

  it("acks and reports without publishing when the content is not JSON", async () => {
    const { message, published, reportedErrors } = await processOneMessage({
      content: "not json at all",
      handler: async () => ok({ ok: true }),
    });

    expect(message.ack).toHaveBeenCalledTimes(1);
    expect(published).toEqual([]);
    expect(reportedErrors).toHaveLength(1);
    expect(reportedErrors[0]?.message).toBe(
      "Invalid command: The command cannot be parsed as JSON",
    );
    expect(reportedErrors[0]?.cause).toBeInstanceOf(SyntaxError);
  });

  it("does not run the handler when the content is not JSON", async () => {
    const handler = vi.fn(async () => ok({ ok: true }));

    await processOneMessage({ content: "not json at all", handler });

    expect(handler).not.toHaveBeenCalled();
  });
});
