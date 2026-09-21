import { describe, it, expect, vi } from "vitest";

import { CommandBusEmitter } from "../emitter";
import {
  type IListenerConnector,
  type IOrderedPublisherConnector,
  type ReceivedMessage,
} from "../../bus-connectors";
import {
  type BusCommand,
  type CommandBusMessage,
  type CommandBusResponse,
} from "../interfaces";

function command(overrides?: Partial<BusCommand>): BusCommand {
  return {
    id: "cmd-1",
    name: "PlaceOrder",
    payload: { orderId: "order-1" },
    metadata: { correlationId: "corr-1" },
    ...overrides,
  };
}

function successResponse(
  overrides?: Partial<{ commandId: string; payload: unknown }>,
): CommandBusResponse {
  return {
    commandId: overrides?.commandId ?? "cmd-1",
    result: "SUCCESS",
    payload: overrides?.payload ?? { status: "PLACED" },
  };
}

function remoteError() {
  return {
    name: "ORDER_ALREADY_PAID",
    code: "OOPS",
    message: "order already paid",
    stack: "Error: order already paid\n    at <anonymous>",
    context: { orderId: "order-1" },
  };
}

function failureResponse(): CommandBusResponse {
  return {
    commandId: "cmd-1",
    result: "FAILURE",
    error: remoteError(),
  };
}

/**
 * An emitter over two stub connectors, with the response channel under the
 * test's control.
 *
 * The connectors are typed as their interfaces rather than cast to them, so a
 * change to the connector contract breaks here at compile time instead of
 * surfacing as a runtime surprise.
 */
function rig(options?: { timeout?: number; publishFails?: Error }) {
  const published: { message: string; options: { orderingKey: string } }[] = [];

  const publish = vi.fn(
    async (
      message: string,
      publishOptions: { orderingKey: string },
    ): Promise<void> => {
      if (options?.publishFails) {
        throw options.publishFails;
      }

      published.push({ message, options: publishOptions });
    },
  );

  let handle: (message: ReceivedMessage) => Promise<void> = async () => {};

  const commandPublisher: IOrderedPublisherConnector = {
    status: "STOPPED",
    start: async () => {},
    stop: async () => {},
    onError: () => {},
    checkConnection: async () => true,
    publish,
  };

  const responseSubscriber: IListenerConnector = {
    status: "STOPPED",
    start: async () => {},
    stop: async () => {},
    onError: () => {},
    checkConnection: async () => true,
    topicName: () => "responses",
    onMessage: (handler) => {
      handle = handler;
    },
  };

  const emitter = new CommandBusEmitter<BusCommand>(
    { commandPublisher, responseSubscriber },
    { timeout: options?.timeout ?? 1000 },
  );

  const reportedErrors: unknown[] = [];
  emitter.onError((error) => reportedErrors.push(error));

  /** Hand the emitter a response, as the broker would. */
  async function deliver(content: string) {
    const message: ReceivedMessage = {
      content,
      ack: vi.fn(async () => {}),
      nack: vi.fn(async () => {}),
    };

    await handle(message);

    return message;
  }

  /** What `send` put on the command topic, deserialized. */
  function publishedMessage(index = 0): CommandBusMessage<BusCommand> {
    const entry = published[index];

    if (entry === undefined) {
      throw new Error("Nothing was published");
    }

    return JSON.parse(entry.message) as CommandBusMessage<BusCommand>;
  }

  return {
    emitter,
    published,
    publish,
    reportedErrors,
    deliver,
    publishedMessage,
  };
}

describe("CommandBusEmitter.send", () => {
  it("rejects when the emitter has not been started", async () => {
    const { emitter } = rig();

    await expect(
      emitter.send({ command: command(), orderingKey: "order-1" }),
    ).rejects.toThrow("Command Bus Emitter is not started");
  });

  it("rejects a command that fails validation", async () => {
    const { emitter } = rig();
    await emitter.start();

    await expect(
      emitter.send({ command: command({ id: "" }), orderingKey: "order-1" }),
    ).rejects.toThrow("Invalid BusCommand: id is an empty string");
  });

  it("does not publish a command that fails validation", async () => {
    const { emitter, published } = rig();
    await emitter.start();

    await emitter
      .send({ command: command({ id: "" }), orderingKey: "order-1" })
      .catch(() => {});

    expect(published).toEqual([]);
  });

  it("publishes the command and its response topic as one JSON envelope", async () => {
    const { emitter, deliver, publishedMessage } = rig();
    await emitter.start();

    const sending = emitter.send({
      command: command(),
      orderingKey: "order-1",
    });

    await deliver(JSON.stringify(successResponse()));
    await sending;

    expect(publishedMessage()).toEqual({
      responseTopicName: "responses",
      command: command(),
    });
  });

  it("forwards the ordering key to the publisher", async () => {
    const { emitter, published, deliver } = rig();
    await emitter.start();

    const sending = emitter.send({
      command: command(),
      orderingKey: "order-1",
    });

    await deliver(JSON.stringify(successResponse()));
    await sending;

    expect(published[0]?.options).toEqual({ orderingKey: "order-1" });
  });

  it("resolves with the payload of a SUCCESS response", async () => {
    const { emitter, deliver } = rig();
    await emitter.start();

    const sending = emitter.send({
      command: command(),
      orderingKey: "order-1",
    });

    await deliver(JSON.stringify(successResponse({ payload: { ok: true } })));

    expect((await sending)._unsafeUnwrap()).toEqual({ ok: true });
  });

  it("resolves with an error carrying the remote name and message", async () => {
    const { emitter, deliver } = rig();
    await emitter.start();

    const sending = emitter.send({
      command: command(),
      orderingKey: "order-1",
    });

    await deliver(JSON.stringify(failureResponse()));

    const error = (await sending)._unsafeUnwrapErr();

    expect(error.name).toBe("ORDER_ALREADY_PAID");
    expect(error.message).toBe("order already paid");
  });

  it("keeps the structured remote error as the cause", async () => {
    const { emitter, deliver } = rig();
    await emitter.start();

    const sending = emitter.send({
      command: command(),
      orderingKey: "order-1",
    });

    await deliver(JSON.stringify(failureResponse()));

    expect((await sending)._unsafeUnwrapErr().cause).toEqual(remoteError());
  });

  it("rejects a second command already in flight under the same id", async () => {
    const { emitter, deliver } = rig();
    await emitter.start();

    const inFlight = emitter.send({
      command: command(),
      orderingKey: "order-1",
    });

    await expect(
      emitter.send({ command: command(), orderingKey: "order-1" }),
    ).rejects.toThrow("Command with id cmd-1 already in flight");

    await deliver(JSON.stringify(successResponse()));
    await inFlight;
  });

  it("reports the command as in flight until it settles", async () => {
    const { emitter, deliver } = rig();
    await emitter.start();

    const sending = emitter.send({
      command: command(),
      orderingKey: "order-1",
    });

    expect(emitter.metrics().inFlightCommands).toBe(1);

    await deliver(JSON.stringify(successResponse()));
    await sending;

    expect(emitter.metrics().inFlightCommands).toBe(0);
  });

  it("rethrows a publish failure", async () => {
    const brokerError = new Error("broker is down");
    const { emitter } = rig({ publishFails: brokerError });
    await emitter.start();

    await expect(
      emitter.send({ command: command(), orderingKey: "order-1" }),
    ).rejects.toThrow(brokerError);
  });

  it("frees the command id when publishing fails", async () => {
    // Without the cleanup, the id would stay in the map forever and every
    // retry would be refused as already in flight.
    const { emitter } = rig({ publishFails: new Error("broker is down") });
    await emitter.start();

    await emitter
      .send({ command: command(), orderingKey: "order-1" })
      .catch(() => {});

    expect(emitter.metrics().inFlightCommands).toBe(0);
  });

  it("resolves with a timeout failure when no response arrives", async () => {
    const { emitter } = rig({ timeout: 20 });
    await emitter.start();

    const result = await emitter.send({
      command: command(),
      orderingKey: "order-1",
    });

    const error = result._unsafeUnwrapErr();

    expect(error.name).toBe("TIMEOUT_ERROR");
    expect(error.message).toContain("exceeded the expected timeout (20ms)");
  });

  it("cancels the timeout timer once the response arrives", async () => {
    // Otherwise a command answered in milliseconds still pins a timer for the
    // full timeout, and those timers hold the event loop open at shutdown.
    vi.useFakeTimers();

    try {
      const { emitter, deliver } = rig({ timeout: 10000 });
      await emitter.start();

      const sending = emitter.send({
        command: command(),
        orderingKey: "order-1",
      });

      await deliver(JSON.stringify(successResponse()));
      await sending;

      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("frees the command id after a timeout", async () => {
    const { emitter } = rig({ timeout: 20 });
    await emitter.start();

    await emitter.send({ command: command(), orderingKey: "order-1" });

    expect(emitter.metrics().inFlightCommands).toBe(0);
  });
});

describe("CommandBusEmitter response handling", () => {
  it("acks every response it receives", async () => {
    const { emitter, deliver } = rig();
    await emitter.start();

    const message = await deliver(JSON.stringify(successResponse()));

    expect(message.ack).toHaveBeenCalledTimes(1);
  });

  it("reports a response that is not JSON", async () => {
    const { emitter, deliver, reportedErrors } = rig();
    await emitter.start();

    await deliver("not json at all");

    expect(reportedErrors).toHaveLength(1);
    expect((reportedErrors[0] as Error).message).toBe(
      "Invalid response: The response cannot be parsed as JSON",
    );
    expect((reportedErrors[0] as Error).cause).toBeInstanceOf(SyntaxError);
  });

  it("reports a response that fails validation", async () => {
    const { emitter, deliver, reportedErrors } = rig();
    await emitter.start();

    await deliver(JSON.stringify({ commandId: "cmd-1", result: "MAYBE" }));

    expect((reportedErrors[0] as Error).message).toBe(
      'Invalid CommandBusResponse: result must be "SUCCESS" or "FAILURE"',
    );
  });

  it("reports a response whose command is no longer in flight", async () => {
    // The ordinary shape of a response that arrives after its command timed out.
    const { emitter, deliver, reportedErrors } = rig();
    await emitter.start();

    await deliver(JSON.stringify(successResponse({ commandId: "unknown" })));

    expect((reportedErrors[0] as Error).message).toContain(
      "Resolver not found",
    );
  });
});

describe("CommandBusEmitter lifecycle", () => {
  it("starts stopped", () => {
    const { emitter } = rig();

    expect(emitter.status()).toBe("STOPPED");
  });

  it("reports STARTED once started", async () => {
    const { emitter } = rig();

    await emitter.start();

    expect(emitter.status()).toBe("STARTED");
  });

  it("reports STOPPED once stopped", async () => {
    const { emitter } = rig();
    await emitter.start();

    await emitter.stop();

    expect(emitter.status()).toBe("STOPPED");
  });

  it("checks both connectors", async () => {
    const { emitter } = rig();

    await expect(emitter.checkConnection()).resolves.toBe(true);
  });
});
