import { describe, it, expect, vi } from "vitest";

import { CommandBusEmitter } from "../emitter";
import { Command } from "../../action";
import {
  type IListenerConnector,
  type IOrderedPublisherConnector,
  type ReceivedMessage,
} from "../../bus-connectors";
import {
  type BusCommand,
  type CommandBusMessage,
  type CommandBusResponse,
  type CommandMetadata,
} from "../interfaces";

function command(overrides?: Partial<BusCommand>): BusCommand {
  return {
    name: "PlaceOrder",
    payload: { orderId: "order-1" },
    ...overrides,
  };
}

function metadata(overrides?: Partial<CommandMetadata>): CommandMetadata {
  return {
    id: "cmd-1",
    createdAt: "2026-01-01T00:00:00.000Z",
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
    code: "COMMAND_REJECTED",
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

  /** The order the connectors were stopped in. */
  const stopped: string[] = [];

  const commandPublisher: IOrderedPublisherConnector = {
    kind: "ordered-publisher",
    status: "STOPPED",
    start: async () => {},
    stop: async () => {
      stopped.push("commandPublisher");
    },
    onError: () => {},
    checkConnection: async () => true,
    publish,
  };

  const responseSubscriber: IListenerConnector = {
    kind: "listener",
    status: "STOPPED",
    start: async () => {},
    stop: async () => {
      stopped.push("responseSubscriber");
    },
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
    stopped,
  };
}

/** Lets pending promise callbacks and short timers run. */
const tick = () => new Promise((resolve) => setTimeout(resolve, 10));

describe("CommandBusEmitter.send", () => {
  it("rejects when the emitter has not been started", async () => {
    const { emitter } = rig();

    await expect(
      emitter.send({
        command: command(),
        metadata: metadata(),
        orderingKey: "order-1",
      }),
    ).rejects.toThrow("Command Bus Emitter is not started");
  });

  it("rejects a command that fails validation", async () => {
    const { emitter } = rig();
    await emitter.start();

    await expect(
      emitter.send({
        command: command({ name: "" }),
        metadata: metadata(),
        orderingKey: "order-1",
      }),
    ).rejects.toThrow("Invalid BusCommand: name is an empty string");
  });

  it("rejects metadata that fails validation", async () => {
    const { emitter } = rig();
    await emitter.start();

    await expect(
      emitter.send({
        command: command(),
        metadata: metadata({ id: "" }),
        orderingKey: "order-1",
      }),
    ).rejects.toThrow("Invalid Metadata: id is an empty string");
  });

  it("rejects metadata whose createdAt is not an ISO date time", async () => {
    const { emitter } = rig();
    await emitter.start();

    await expect(
      emitter.send({
        command: command(),
        metadata: metadata({ createdAt: "yesterday" }),
        orderingKey: "order-1",
      }),
    ).rejects.toThrow(
      "Invalid Metadata: createdAt is not a valid ISO date time string",
    );
  });

  it("does not publish a command that fails validation", async () => {
    const { emitter, published } = rig();
    await emitter.start();

    await emitter
      .send({
        command: command(),
        metadata: metadata({ id: "" }),
        orderingKey: "order-1",
      })
      .catch(() => {});

    expect(published).toEqual([]);
  });

  it("publishes the command and its response topic as one JSON envelope", async () => {
    const { emitter, deliver, publishedMessage } = rig();
    await emitter.start();

    const sending = emitter.send({
      command: command(),
      metadata: metadata(),
      orderingKey: "order-1",
    });

    await deliver(JSON.stringify(successResponse()));
    await sending;

    expect(publishedMessage()).toEqual({
      responseTopicName: "responses",
      command: command(),
      metadata: metadata(),
    });
  });

  it("publishes a use-case Command through its toJSON", async () => {
    class PlaceOrderCommand extends Command<
      "PLACE_ORDER",
      { orderId: string }
    > {
      constructor(payload: { orderId: string }) {
        super({ name: "PLACE_ORDER", payload });
      }
    }
    const { emitter, deliver, publishedMessage } = rig();
    await emitter.start();

    const sending = emitter.send({
      command: new PlaceOrderCommand({ orderId: "order-1" }),
      metadata: metadata(),
      orderingKey: "order-1",
    });
    await deliver(JSON.stringify(successResponse()));
    await sending;

    expect(publishedMessage().command).toEqual({
      kind: "command",
      name: "PLACE_ORDER",
      payload: { orderId: "order-1" },
    });
  });

  it("forwards the ordering key to the publisher", async () => {
    const { emitter, published, deliver } = rig();
    await emitter.start();

    const sending = emitter.send({
      command: command(),
      metadata: metadata(),
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
      metadata: metadata(),
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
      metadata: metadata(),
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
      metadata: metadata(),
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
      metadata: metadata(),
      orderingKey: "order-1",
    });

    await expect(
      emitter.send({
        command: command(),
        metadata: metadata(),
        orderingKey: "order-1",
      }),
    ).rejects.toThrow("Command with id cmd-1 already in flight");

    await deliver(JSON.stringify(successResponse()));
    await inFlight;
  });

  it("reports the command as in flight until it settles", async () => {
    const { emitter, deliver } = rig();
    await emitter.start();

    const sending = emitter.send({
      command: command(),
      metadata: metadata(),
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
      emitter.send({
        command: command(),
        metadata: metadata(),
        orderingKey: "order-1",
      }),
    ).rejects.toThrow(brokerError);
  });

  it("frees the command id when publishing fails", async () => {
    // Without the cleanup, the id would stay in the map forever and every
    // retry would be refused as already in flight.
    const { emitter } = rig({ publishFails: new Error("broker is down") });
    await emitter.start();

    await emitter
      .send({
        command: command(),
        metadata: metadata(),
        orderingKey: "order-1",
      })
      .catch(() => {});

    expect(emitter.metrics().inFlightCommands).toBe(0);
  });

  it("resolves with a timeout failure when no response arrives", async () => {
    const { emitter } = rig({ timeout: 20 });
    await emitter.start();

    const result = await emitter.send({
      command: command(),
      metadata: metadata(),
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
        metadata: metadata(),
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

    await emitter.send({
      command: command(),
      metadata: metadata(),
      orderingKey: "order-1",
    });

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

  it("waits for a command in flight and hands it its real response", async () => {
    const { emitter, deliver } = rig({ timeout: 10000 });
    await emitter.start();

    const sending = emitter.send({
      command: command(),
      metadata: metadata(),
      orderingKey: "order-1",
    });
    const stopping = emitter.stop();
    await deliver(JSON.stringify(successResponse()));
    await stopping;

    expect((await sending)._unsafeUnwrap()).toEqual({ status: "PLACED" });
  });

  it("lets a command with no answer time out while stopping", async () => {
    const { emitter } = rig({ timeout: 20 });
    await emitter.start();

    const sending = emitter.send({
      command: command(),
      metadata: metadata(),
      orderingKey: "order-1",
    });
    await emitter.stop();

    expect((await sending)._unsafeUnwrapErr().name).toBe("TIMEOUT_ERROR");
  });

  it("refuses new commands while stopping", async () => {
    const { emitter } = rig({ timeout: 20 });
    await emitter.start();

    const sending = emitter.send({
      command: command(),
      metadata: metadata(),
      orderingKey: "order-1",
    });
    const stopping = emitter.stop();

    await expect(
      emitter.send({
        command: command(),
        metadata: metadata({ id: "cmd-2" }),
        orderingKey: "order-2",
      }),
    ).rejects.toThrow("Command Bus Emitter is stopping");

    await Promise.all([sending, stopping]);
  });

  it("reports STOPPING while commands are draining", async () => {
    const { emitter, deliver } = rig({ timeout: 10000 });
    await emitter.start();

    const sending = emitter.send({
      command: command(),
      metadata: metadata(),
      orderingKey: "order-1",
    });
    const stopping = emitter.stop();
    await tick();

    expect(emitter.status()).toBe("STOPPING");

    await deliver(JSON.stringify(successResponse()));
    await Promise.all([sending, stopping]);
  });

  it("keeps its connectors running until the drain is over", async () => {
    const { emitter, deliver, stopped } = rig({ timeout: 10000 });
    await emitter.start();

    const sending = emitter.send({
      command: command(),
      metadata: metadata(),
      orderingKey: "order-1",
    });
    const stopping = emitter.stop();
    await tick();

    expect(stopped).toEqual([]);

    await deliver(JSON.stringify(successResponse()));
    await Promise.all([sending, stopping]);
  });

  it("stops the publisher, then the response subscriber", async () => {
    const { emitter, stopped } = rig();
    await emitter.start();

    await emitter.stop();

    expect(stopped).toEqual(["commandPublisher", "responseSubscriber"]);
  });

  it("stops its connectors once when stop is called twice during the drain", async () => {
    const { emitter, deliver, stopped } = rig({ timeout: 10000 });
    await emitter.start();

    const sending = emitter.send({
      command: command(),
      metadata: metadata(),
      orderingKey: "order-1",
    });
    const stopping = [emitter.stop(), emitter.stop()];
    await deliver(JSON.stringify(successResponse()));
    await Promise.all([sending, ...stopping]);

    expect(stopped).toEqual(["commandPublisher", "responseSubscriber"]);
  });

  it("does not force the stop before 2 minutes by default", async () => {
    vi.useFakeTimers();

    try {
      const { emitter } = rig({ timeout: 600_000 });
      await emitter.start();

      void emitter.send({
        command: command(),
        metadata: metadata(),
        orderingKey: "order-1",
      });
      let stopped = false;
      void emitter.stop().then(() => {
        stopped = true;
      });
      await vi.advanceTimersByTimeAsync(119_999);

      expect(stopped).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("forces the stop after 2 minutes by default", async () => {
    vi.useFakeTimers();

    try {
      const { emitter } = rig({ timeout: 600_000 });
      await emitter.start();

      void emitter.send({
        command: command(),
        metadata: metadata(),
        orderingKey: "order-1",
      });
      const stopping = emitter.stop();
      await vi.advanceTimersByTimeAsync(120_000);
      await stopping;

      expect(emitter.status()).toBe("STOPPED");
    } finally {
      vi.useRealTimers();
    }
  });

  it("settles a command still waiting with EMITTER_STOPPED when the stop is forced", async () => {
    const { emitter } = rig({ timeout: 10000 });
    await emitter.start();

    const sending = emitter.send({
      command: command(),
      metadata: metadata(),
      orderingKey: "order-1",
    });
    await emitter.stop({ timeout: 20 });

    const error = (await sending)._unsafeUnwrapErr();

    expect(error.name).toBe("EMITTER_STOPPED_ERROR");
    expect(error.cause).toMatchObject({
      code: "EMITTER_STOPPED",
      context: { commandId: "cmd-1" },
    });
  });

  it("reports a forced stop through onError", async () => {
    const { emitter, reportedErrors } = rig({ timeout: 10000 });
    await emitter.start();

    const sending = emitter.send({
      command: command(),
      metadata: metadata(),
      orderingKey: "order-1",
    });
    await emitter.stop({ timeout: 20 });
    await sending;

    expect((reportedErrors[0] as Error).message).toBe(
      "[CommandBusEmitter] Stop timed out after 20ms: 1 command(s) still in flight were settled with EMITTER_STOPPED",
    );
  });

  it("stops its connectors when the stop is forced", async () => {
    const { emitter, stopped } = rig({ timeout: 10000 });
    await emitter.start();

    const sending = emitter.send({
      command: command(),
      metadata: metadata(),
      orderingKey: "order-1",
    });
    await emitter.stop({ timeout: 20 });
    await sending;

    expect(stopped).toEqual(["commandPublisher", "responseSubscriber"]);
  });

  it("reports nothing when the drain finishes in time", async () => {
    const { emitter, deliver, reportedErrors } = rig({ timeout: 10000 });
    await emitter.start();

    const sending = emitter.send({
      command: command(),
      metadata: metadata(),
      orderingKey: "order-1",
    });
    const stopping = emitter.stop();
    await deliver(JSON.stringify(successResponse()));
    await Promise.all([sending, stopping]);

    expect(reportedErrors).toEqual([]);
  });

  it("checks both connectors", async () => {
    const { emitter } = rig();

    await expect(emitter.checkConnection()).resolves.toBe(true);
  });
});
