import { afterEach, describe, it, expect, vi } from "vitest";
import type { ReceivedMessage } from "ontologic";

import {
  GroupedConsumer,
  type GroupedConsumerOptions,
} from "../groupedConsumer";

const QUEUE_URL = "http://localhost:4566/000000000000/q.fifo";

interface SqsMessage {
  Body?: string;
  ReceiptHandle?: string;
  MessageId?: string;
  Attributes?: Record<string, string>;
}

let consumers: GroupedConsumer[] = [];

afterEach(async () => {
  // stop() waits for the receive in progress, whose idle wait is a timer: under
  // fake timers, keep them moving until every consumer has stopped.
  let stopped = false;
  const stopping = Promise.all(
    consumers.map((consumer) => consumer.stop()),
  ).then(() => {
    stopped = true;
  });

  while (vi.isFakeTimers() && !stopped) {
    await vi.advanceTimersByTimeAsync(10);
  }

  await stopping;
  vi.useRealTimers();
  consumers = [];
});

function message(
  body: string,
  attributes?: { group?: string; deliveries?: number },
): SqsMessage {
  return {
    Body: body,
    ReceiptHandle: `rh-${body}`,
    MessageId: `id-${body}`,
    Attributes: {
      ...(attributes?.group === undefined
        ? {}
        : { MessageGroupId: attributes.group }),
      ApproximateReceiveCount: String(attributes?.deliveries ?? 1),
    },
  };
}

/**
 * A client that hands out each batch once, in order, then idles like a long
 * poll. Every command it is sent is recorded.
 */
function scriptedClient(
  batches: SqsMessage[][],
  options?: { receiveFails?: number },
) {
  const sent: { name: string; input: Record<string, unknown> }[] = [];
  let failuresLeft = options?.receiveFails ?? 0;
  let next = 0;

  const send = vi.fn(
    async (
      command: { constructor: { name: string }; input: object },
      sendOptions?: { abortSignal?: AbortSignal },
    ) => {
      const name = command.constructor.name;
      sent.push({ name, input: command.input as Record<string, unknown> });

      if (name !== "ReceiveMessageCommand") {
        return {};
      }

      if (failuresLeft > 0) {
        failuresLeft -= 1;
        throw new Error("Throttled");
      }

      const batch = batches[next];

      if (batch !== undefined) {
        next += 1;
        return { Messages: batch };
      }

      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 5);
        sendOptions?.abortSignal?.addEventListener("abort", () => {
          clearTimeout(timer);
          resolve();
        });
      });

      return {};
    },
  );

  return {
    client: { send } as unknown as GroupedConsumerOptions["client"],
    sent,
    receives: () => sent.filter((c) => c.name === "ReceiveMessageCommand"),
    ofType: (name: string) => sent.filter((c) => c.name === name),
  };
}

function consume(
  client: GroupedConsumerOptions["client"],
  handler: (message: ReceivedMessage) => Promise<void>,
  overrides?: Partial<GroupedConsumerOptions>,
) {
  const errors: Error[] = [];
  const consumer = new GroupedConsumer({
    connectorName: "SQS/Test",
    client,
    queueUrl: QUEUE_URL,
    handler,
    emitError: (error) => errors.push(error),
    waitTimeSeconds: 1,
    maxMessages: 10,
    maxInFlight: 50,
    nackVisibilitySeconds: 0,
    ...overrides,
  });

  consumers.push(consumer);
  consumer.start();

  return { consumer, errors };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitUntil(predicate: () => boolean, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate() && Date.now() < deadline) {
    await sleep(5);
  }
}

/** A handler that records start/end, taking `ms` per message, and acks. */
function recordingHandler(log: string[], ms = 20) {
  return async (received: ReceivedMessage) => {
    log.push(`start:${received.content}`);
    await sleep(ms);
    log.push(`end:${received.content}`);
    await received.ack();
  };
}

describe("GroupedConsumer: groups", () => {
  it("runs one group's messages one after the other, in order", async () => {
    const { client } = scriptedClient([
      [message("a1", { group: "a" }), message("a2", { group: "a" })],
    ]);
    const log: string[] = [];

    consume(client, recordingHandler(log));
    await waitUntil(() => log.length === 4);

    expect(log).toEqual(["start:a1", "end:a1", "start:a2", "end:a2"]);
  });

  it("runs different groups at the same time", async () => {
    const { client } = scriptedClient([
      [message("a1", { group: "a" }), message("b1", { group: "b" })],
    ]);
    const log: string[] = [];

    consume(client, recordingHandler(log));
    await waitUntil(() => log.length === 4);

    expect(log.slice(0, 2).sort()).toEqual(["start:a1", "start:b1"]);
  });

  it("runs messages without a group in parallel", async () => {
    const { client } = scriptedClient([[message("x"), message("y")]]);
    const log: string[] = [];

    consume(client, recordingHandler(log));
    await waitUntil(() => log.length === 4);

    expect(log.slice(0, 2).sort()).toEqual(["start:x", "start:y"]);
  });

  it("forgets a group once it has no more work", async () => {
    const { client } = scriptedClient([[message("a1", { group: "a" })]]);
    const log: string[] = [];

    const { consumer } = consume(client, recordingHandler(log, 1));
    await waitUntil(() => log.length === 2);
    await sleep(5);

    expect(consumer.activeMessageGroups).toBe(0);
  });

  it("reports the groups that have work", async () => {
    const { client } = scriptedClient([
      [message("a1", { group: "a" }), message("b1", { group: "b" })],
    ]);
    const log: string[] = [];

    const { consumer } = consume(client, recordingHandler(log, 50));
    await waitUntil(() => log.length === 2);

    expect(consumer.activeMessageGroups).toBe(2);
  });

  it("reports a message with no body without handling it", async () => {
    const { client } = scriptedClient([[{ ReceiptHandle: "rh" }]]);
    const handler = vi.fn(async () => {});

    const { errors } = consume(client, handler);
    await waitUntil(() => errors.length === 1);

    expect(errors[0]?.message).toBe(
      "[SQS/Test] Received a message with no body or receipt handle",
    );
  });
});

describe("GroupedConsumer: receiving", () => {
  it("asks for the group id and the delivery count", async () => {
    const { client, receives } = scriptedClient([]);

    consume(client, async () => {});
    await waitUntil(() => receives().length > 0);

    expect(receives()[0]?.input).toMatchObject({
      MessageSystemAttributeNames: [
        "MessageGroupId",
        "ApproximateReceiveCount",
      ],
    });
  });

  it("only receives into the slots it has free", async () => {
    const { client, receives } = scriptedClient([
      [message("a1", { group: "a" }), message("b1", { group: "b" })],
    ]);

    consume(
      client,
      async () => {
        await sleep(200);
      },
      { maxInFlight: 3 },
    );
    await waitUntil(() => receives().length >= 2);

    expect(receives()[1]?.input).toMatchObject({ MaxNumberOfMessages: 1 });
  });

  it("does not receive while every slot is taken", async () => {
    const { client, receives } = scriptedClient([
      [message("a1", { group: "a" }), message("b1", { group: "b" })],
    ]);

    consume(
      client,
      async () => {
        await sleep(100);
      },
      { maxInFlight: 2 },
    );
    await sleep(50);

    expect(receives()).toHaveLength(1);
  });

  it("receives again once a slot frees up", async () => {
    const { client, receives } = scriptedClient([
      [message("a1", { group: "a" }), message("b1", { group: "b" })],
    ]);

    consume(client, async (received) => received.ack(), { maxInFlight: 2 });
    await waitUntil(() => receives().length >= 2);

    expect(receives().length).toBeGreaterThanOrEqual(2);
  });

  it("never asks for more than maxMessages at once", async () => {
    const { client, receives } = scriptedClient([]);

    consume(client, async () => {}, { maxMessages: 3 });
    await waitUntil(() => receives().length > 0);

    expect(receives()[0]?.input).toMatchObject({ MaxNumberOfMessages: 3 });
  });

  it("reports a failed receive", async () => {
    const { client } = scriptedClient([], { receiveFails: 1 });

    const { errors } = consume(client, async () => {});
    await waitUntil(() => errors.length === 1);

    expect(errors[0]?.message).toBe("Throttled");
  });

  it("waits a second before receiving again after a failure", async () => {
    vi.useFakeTimers();
    const { client, receives } = scriptedClient([], { receiveFails: 1 });

    consume(client, async () => {});
    await vi.advanceTimersByTimeAsync(999);

    expect(receives()).toHaveLength(1);
  });

  it("receives again once the second has passed", async () => {
    vi.useFakeTimers();
    const { client, receives } = scriptedClient([], { receiveFails: 1 });

    consume(client, async () => {});
    await vi.advanceTimersByTimeAsync(1000);

    expect(receives().length).toBeGreaterThanOrEqual(2);
  });
});

describe("GroupedConsumer: failures", () => {
  it("does not run a group's next message after a nack", async () => {
    const { client } = scriptedClient([
      [message("a1", { group: "a" }), message("a2", { group: "a" })],
    ]);
    const seen: string[] = [];

    consume(client, async (received) => {
      seen.push(received.content);
      await received.nack();
    });
    await sleep(50);

    expect(seen).toEqual(["a1"]);
  });

  it("hands the group's next message back without acking it", async () => {
    const { client, ofType } = scriptedClient([
      [message("a1", { group: "a" }), message("a2", { group: "a" })],
    ]);

    consume(client, async (received) => received.nack());
    await waitUntil(
      () => ofType("ChangeMessageVisibilityCommand").length === 2,
    );

    expect(ofType("DeleteMessageCommand")).toEqual([]);
  });

  it("gives the failed message and its group the nack visibility", async () => {
    const { client, ofType } = scriptedClient([
      [message("a1", { group: "a" }), message("a2", { group: "a" })],
    ]);

    consume(client, async (received) => received.nack(), {
      nackVisibilitySeconds: 30,
    });
    await waitUntil(
      () => ofType("ChangeMessageVisibilityCommand").length === 2,
    );

    expect(
      ofType("ChangeMessageVisibilityCommand").map((c) => [
        c.input["ReceiptHandle"],
        c.input["VisibilityTimeout"],
      ]),
    ).toEqual([
      ["rh-a1", 30],
      ["rh-a2", 30],
    ]);
  });

  it("releases a nacked message at once by default", async () => {
    const { client, ofType } = scriptedClient([
      [message("a1", { group: "a" })],
    ]);

    consume(client, async (received) => received.nack());
    await waitUntil(
      () => ofType("ChangeMessageVisibilityCommand").length === 1,
    );

    expect(ofType("ChangeMessageVisibilityCommand")[0]?.input).toMatchObject({
      VisibilityTimeout: 0,
    });
  });

  it("blocks the group when the handler throws", async () => {
    const { client } = scriptedClient([
      [message("a1", { group: "a" }), message("a2", { group: "a" })],
    ]);
    const seen: string[] = [];

    consume(client, async (received) => {
      seen.push(received.content);
      throw new Error("boom");
    });
    await sleep(50);

    expect(seen).toEqual(["a1"]);
  });

  it("hands back a message whose handler threw", async () => {
    const { client, ofType } = scriptedClient([
      [message("a1", { group: "a" })],
    ]);

    consume(client, async () => {
      throw new Error("boom");
    });
    await waitUntil(
      () => ofType("ChangeMessageVisibilityCommand").length === 1,
    );

    expect(ofType("ChangeMessageVisibilityCommand")[0]?.input).toMatchObject({
      ReceiptHandle: "rh-a1",
    });
  });

  it("reports what the handler threw", async () => {
    const { client } = scriptedClient([[message("a1", { group: "a" })]]);

    const { errors } = consume(client, async () => {
      throw new Error("boom");
    });
    await waitUntil(() => errors.length === 1);

    expect(errors[0]?.message).toBe("boom");
  });

  it("does not block a group when the handler threw after acking", async () => {
    const { client } = scriptedClient([
      [message("a1", { group: "a" }), message("a2", { group: "a" })],
    ]);
    const seen: string[] = [];

    consume(client, async (received) => {
      seen.push(received.content);
      await received.ack();
      throw new Error("after the fact");
    });
    await waitUntil(() => seen.length === 2);

    expect(seen).toEqual(["a1", "a2"]);
  });

  it("keeps running other groups while one is blocked", async () => {
    const { client } = scriptedClient([
      [message("a1", { group: "a" }), message("b1", { group: "b" })],
    ]);
    const acked: string[] = [];

    consume(client, async (received) => {
      if (received.content === "a1") {
        await received.nack();
        return;
      }
      await received.ack();
      acked.push(received.content);
    });
    await waitUntil(() => acked.length === 1);

    expect(acked).toEqual(["b1"]);
  });
});

describe("GroupedConsumer: maxDeliveries", () => {
  it("does not run the handler for a message delivered too many times", async () => {
    const { client } = scriptedClient([
      [message("a1", { group: "a", deliveries: 4 })],
    ]);
    const handler = vi.fn(async () => {});

    consume(client, handler, { maxDeliveries: 3 });
    await sleep(30);

    expect(handler).not.toHaveBeenCalled();
  });

  it("deletes a discarded message", async () => {
    const { client, ofType } = scriptedClient([
      [message("a1", { group: "a", deliveries: 4 })],
    ]);

    consume(client, async () => {}, { maxDeliveries: 3 });
    await waitUntil(() => ofType("DeleteMessageCommand").length === 1);

    expect(ofType("DeleteMessageCommand")[0]?.input).toMatchObject({
      ReceiptHandle: "rh-a1",
    });
  });

  it("tells onDiscard about it with its number of deliveries", async () => {
    const { client } = scriptedClient([
      [message("a1", { group: "a", deliveries: 4 })],
    ]);
    const onDiscard = vi.fn();

    consume(client, async () => {}, { maxDeliveries: 3, onDiscard });
    await waitUntil(() => onDiscard.mock.calls.length === 1);

    expect(onDiscard.mock.calls[0]?.[1]).toBe(4);
  });

  it("moves on to the group's next message after a discard", async () => {
    const { client } = scriptedClient([
      [
        message("a1", { group: "a", deliveries: 4 }),
        message("a2", { group: "a" }),
      ],
    ]);
    const seen: string[] = [];

    consume(
      client,
      async (received) => {
        seen.push(received.content);
        await received.ack();
      },
      { maxDeliveries: 3 },
    );
    await waitUntil(() => seen.length === 1);

    expect(seen).toEqual(["a2"]);
  });

  it("handles a message at the limit", async () => {
    const { client } = scriptedClient([
      [message("a1", { group: "a", deliveries: 3 })],
    ]);
    const handler = vi.fn(async (received: ReceivedMessage) => received.ack());

    consume(client, handler, { maxDeliveries: 3 });
    await waitUntil(() => handler.mock.calls.length === 1);

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("handles a message however many deliveries without maxDeliveries", async () => {
    const { client } = scriptedClient([
      [message("a1", { group: "a", deliveries: 99 })],
    ]);
    const handler = vi.fn(async (received: ReceivedMessage) => received.ack());

    consume(client, handler);
    await waitUntil(() => handler.mock.calls.length === 1);

    expect(handler).toHaveBeenCalledTimes(1);
  });
});

describe("GroupedConsumer: stop", () => {
  it("waits for the messages being handled", async () => {
    const { client } = scriptedClient([[message("a1", { group: "a" })]]);
    const log: string[] = [];

    const { consumer } = consume(client, recordingHandler(log, 50));
    await waitUntil(() => log.length === 1);
    await consumer.stop();

    expect(log).toEqual(["start:a1", "end:a1"]);
  });

  it("waits for the messages still queued behind their group", async () => {
    const { client } = scriptedClient([
      [message("a1", { group: "a" }), message("a2", { group: "a" })],
    ]);
    const log: string[] = [];

    const { consumer } = consume(client, recordingHandler(log, 20));
    await waitUntil(() => log.length === 1);
    await consumer.stop();

    expect(log).toEqual(["start:a1", "end:a1", "start:a2", "end:a2"]);
  });

  it("stops receiving", async () => {
    const { client, receives } = scriptedClient([]);

    const { consumer } = consume(client, async () => {});
    await waitUntil(() => receives().length > 0);
    await consumer.stop();
    const receivesAtStop = receives().length;
    await sleep(30);

    expect(receives()).toHaveLength(receivesAtStop);
  });

  it("does not wait out the backoff when stopped", async () => {
    vi.useFakeTimers();
    const { client } = scriptedClient([], { receiveFails: 1 });

    const { consumer } = consume(client, async () => {});
    await vi.advanceTimersByTimeAsync(1);
    let stopped = false;
    void consumer.stop().then(() => {
      stopped = true;
    });
    await vi.advanceTimersByTimeAsync(10);

    expect(stopped).toBe(true);
  });

  describe("a receive still in progress", () => {
    /**
     * A client whose first receive answers only when the test says so, with
     * one message. Models SQS keeping a long poll open after a stop.
     */
    function slowReceiveClient() {
      const sent: { name: string; input: Record<string, unknown> }[] = [];
      let answer: (value: unknown) => void = () => {};
      let receives = 0;
      const pending = new Promise((resolve) => {
        answer = resolve;
      });

      const send = vi.fn(
        async (
          command: { constructor: { name: string }; input: object },
          _options?: { abortSignal?: AbortSignal },
        ) => {
          sent.push({
            name: command.constructor.name,
            input: command.input as Record<string, unknown>,
          });

          if (command.constructor.name !== "ReceiveMessageCommand") {
            return {};
          }

          receives += 1;

          return receives === 1 ? pending : {};
        },
      );

      return {
        client: { send } as unknown as GroupedConsumerOptions["client"],
        sent,
        send,
        deliverLate: () =>
          answer({ Messages: [message("late", { group: "a" })] }),
      };
    }

    it("is sent with no abort signal, so stop cannot cut it", async () => {
      // Aborting only closes the client's side: SQS keeps the long poll open
      // and hands the next messages to a request nobody reads any more.
      const { client, send, deliverLate } = slowReceiveClient();
      const { consumer } = consume(client, async () => {});
      await sleep(5);

      const stopping = consumer.stop();
      deliverLate();
      await stopping;

      expect(send.mock.calls[0]?.[1]?.abortSignal).toBeUndefined();
    });

    it("keeps stop waiting until it answers", async () => {
      const { client, deliverLate } = slowReceiveClient();
      const { consumer } = consume(client, async () => {});
      await sleep(5);

      let stopped = false;
      const stopping = consumer.stop().then(() => {
        stopped = true;
      });
      await sleep(20);
      const stoppedBeforeTheReceiveAnswered = stopped;
      deliverLate();
      await stopping;

      expect(stoppedBeforeTheReceiveAnswered).toBe(false);
    });

    it("has what it brings back after stop handed straight back", async () => {
      const { client, sent, deliverLate } = slowReceiveClient();
      const { consumer } = consume(client, async () => {});
      await sleep(5);

      const stopping = consumer.stop();
      deliverLate();
      await stopping;

      expect(
        sent.find((c) => c.name === "ChangeMessageVisibilityCommand")?.input,
      ).toMatchObject({ ReceiptHandle: "rh-late", VisibilityTimeout: 0 });
    });

    it("does not hand what it brings back after stop to the handler", async () => {
      const { client, deliverLate } = slowReceiveClient();
      const handler = vi.fn(async () => {});
      const { consumer } = consume(client, handler);
      await sleep(5);

      const stopping = consumer.stop();
      deliverLate();
      await stopping;

      expect(handler).not.toHaveBeenCalled();
    });
  });
});
