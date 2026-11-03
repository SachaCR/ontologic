import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { SqsOrderedListener } from "../orderedListener";
import type { ReceivedMessage } from "ontologic";

import {
  createSqsClientMock,
  flush,
  QUEUE_URL,
  waitUntil,
  type SqsClientMock,
} from "./helpers/sqsClientMock";

const { clientRef, SQSClientMock } = vi.hoisted(() => {
  const clientRef: { current: unknown } = { current: undefined };

  class SQSClientMock {
    constructor() {
      return clientRef.current as object;
    }
  }

  return { clientRef, SQSClientMock };
});

vi.mock("@aws-sdk/client-sqs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@aws-sdk/client-sqs")>()),
  SQSClient: SQSClientMock,
}));

let client: SqsClientMock;
let running: InstanceType<typeof SqsOrderedListener>[] = [];

beforeEach(() => {
  client = createSqsClientMock();
  client.respondTo("CreateQueueCommand", { QueueUrl: QUEUE_URL });
  client.respondTo("GetQueueUrlCommand", { QueueUrl: QUEUE_URL });
  clientRef.current = client;
  running = [];
});

afterEach(async () => {
  // The poll loop outlives the assertion, so every started listener has to be
  // stopped or vitest hangs on an open handle.
  await Promise.all(running.map((listener) => listener.stop().catch(() => {})));
});

function listener(
  overrides?: Partial<{
    queueName: string;
    waitTimeSeconds: number;
    maxMessages: number;
  }>,
) {
  const created = new SqsOrderedListener({
    queueName: overrides?.queueName ?? "commands.fifo",
    region: "us-east-1",
    ...(overrides?.waitTimeSeconds === undefined
      ? {}
      : { waitTimeSeconds: overrides.waitTimeSeconds }),
    ...(overrides?.maxMessages === undefined
      ? {}
      : { maxMessages: overrides.maxMessages }),
  });

  running.push(created);

  return created;
}

/** Deliver a batch on the first receive, then idle. */
function deliver(
  messages: {
    Body?: string;
    ReceiptHandle?: string;
    Attributes?: Record<string, string>;
  }[],
  options?: { failOn?: string },
) {
  let delivered = false;

  client.send.mockImplementation(
    async (command: { constructor: { name: string } }) => {
      const kind = command.constructor.name;

      if (options?.failOn === kind) {
        throw new Error("Throttled");
      }

      if (kind === "GetQueueUrlCommand") {
        return { QueueUrl: QUEUE_URL };
      }

      if (kind === "ReceiveMessageCommand") {
        if (delivered) {
          // Idle like a real long poll rather than spinning the read loop.
          await new Promise((resolve) => setTimeout(resolve, 5));

          return {};
        }

        delivered = true;

        return { Messages: messages };
      }

      return {};
    },
  );
}

async function started(
  handler: Parameters<InstanceType<typeof SqsOrderedListener>["onMessage"]>[0],
  overrides?: Parameters<typeof listener>[0],
) {
  const connector = listener(overrides);
  connector.onMessage(handler);
  await connector.start();
  await flush();

  return connector;
}

describe("SqsOrderedListener", () => {
  it("identifies itself as an ordered listener", () => {
    expect(listener().kind).toBe("ordered-listener");
  });

  it("reports the queue name, not the resolved url", () => {
    expect(listener({ queueName: "orders.fifo" }).topicName()).toBe(
      "orders.fifo",
    );
  });

  it("rejects a queue name without the FIFO suffix", () => {
    expect(() => listener({ queueName: "commands" })).toThrow(
      '[SQS/OrderedListener] A FIFO queue name must end in ".fifo", got "commands"',
    );
  });

  it("refuses to start with no handler registered", async () => {
    await expect(listener().start()).rejects.toThrow(
      "[SQS/OrderedListener] No handler set on message",
    );
  });

  it("checks for a handler before resolving the queue", async () => {
    await listener()
      .start()
      .catch(() => {});

    expect(client.send).not.toHaveBeenCalled();
  });

  describe("options", () => {
    it("long-polls for 20 seconds by default", async () => {
      await started(async () => {});

      expect(client.commandsOfType("ReceiveMessageCommand")[0]).toMatchObject({
        input: { WaitTimeSeconds: 20 },
      });
    });

    it("uses the wait time it is given", async () => {
      await started(async () => {}, { waitTimeSeconds: 1 });

      expect(client.commandsOfType("ReceiveMessageCommand")[0]).toMatchObject({
        input: { WaitTimeSeconds: 1 },
      });
    });

    it("reads batches of ten by default", async () => {
      await started(async () => {});

      expect(client.commandsOfType("ReceiveMessageCommand")[0]).toMatchObject({
        input: { MaxNumberOfMessages: 10 },
      });
    });

    it("uses the batch size it is given", async () => {
      await started(async () => {}, { maxMessages: 1 });

      expect(client.commandsOfType("ReceiveMessageCommand")[0]).toMatchObject({
        input: { MaxNumberOfMessages: 1 },
      });
    });

    it("receives from the resolved queue url", async () => {
      await started(async () => {});

      expect(client.commandsOfType("ReceiveMessageCommand")[0]).toMatchObject({
        input: { QueueUrl: QUEUE_URL },
      });
    });
  });

  describe("dispatch", () => {
    it("hands a received message to the handler", async () => {
      deliver([{ Body: "payload", ReceiptHandle: "r-1" }]);

      const seen: ReceivedMessage[] = [];
      await started(async (message) => {
        seen.push(message);
      });

      expect(seen.map((message) => message.content)).toEqual(["payload"]);
    });

    it("deletes the message when the handler acks", async () => {
      deliver([{ Body: "payload", ReceiptHandle: "r-1" }]);

      await started(async (message) => {
        await message.ack();
      });

      expect(client.commandsOfType("DeleteMessageCommand")[0]).toMatchObject({
        input: { QueueUrl: QUEUE_URL, ReceiptHandle: "r-1" },
      });
    });

    it("releases the message immediately when the handler nacks", async () => {
      // Zero, not the visibility timeout: leaving it to expire would stall
      // every other command sharing its ordering key for that whole window.
      deliver([{ Body: "payload", ReceiptHandle: "r-1" }]);

      await started(async (message) => {
        await message.nack();
      });

      expect(
        client.commandsOfType("ChangeMessageVisibilityCommand")[0],
      ).toMatchObject({
        input: { ReceiptHandle: "r-1", VisibilityTimeout: 0 },
      });
    });

    it("processes one message group's messages one at a time", async () => {
      // The invariant that keeps FIFO ordering. Handling a group's messages
      // concurrently would throw away the very thing a FIFO queue is chosen
      // for, and a round-trip test cannot see the difference.
      const group = { MessageGroupId: "order-1" };
      deliver([
        { Body: "first", ReceiptHandle: "r-1", Attributes: group },
        { Body: "second", ReceiptHandle: "r-2", Attributes: group },
        { Body: "third", ReceiptHandle: "r-3", Attributes: group },
      ]);

      const events: string[] = [];
      await started(async (message) => {
        events.push(`start:${message.content}`);
        await new Promise((resolve) => setTimeout(resolve, 10));
        events.push(`end:${message.content}`);
      });

      await waitUntil(() => events.length === 6);

      expect(events).toEqual([
        "start:first",
        "end:first",
        "start:second",
        "end:second",
        "start:third",
        "end:third",
      ]);
    });

    it("reports a message with no body rather than crashing the loop", async () => {
      deliver([{ ReceiptHandle: "r-1" }]);

      const connector = listener();
      const reported: Error[] = [];
      connector.onError((error) => reported.push(error));
      connector.onMessage(async () => {});
      await connector.start();
      await flush();

      expect(reported[0]?.message).toBe(
        "[SQS/OrderedListener] Received a message with no body or receipt handle",
      );
    });

    it("reports a rejecting handler without stopping the loop", async () => {
      deliver([
        { Body: "first", ReceiptHandle: "r-1" },
        { Body: "second", ReceiptHandle: "r-2" },
      ]);

      const seen: string[] = [];
      const connector = listener();
      const reported: Error[] = [];
      connector.onError((error) => reported.push(error));
      connector.onMessage(async (message) => {
        seen.push(message.content);
        throw new Error("handler blew up");
      });
      await connector.start();
      await flush();

      expect(seen).toEqual(["first", "second"]);
      expect(reported.map((error) => error.message)).toEqual([
        "handler blew up",
        "handler blew up",
      ]);
    });

    it("reports a failed delete", async () => {
      deliver([{ Body: "payload", ReceiptHandle: "r-1" }], {
        failOn: "DeleteMessageCommand",
      });

      const connector = listener();
      const reported: Error[] = [];
      connector.onError((error) => reported.push(error));
      connector.onMessage(async (message) => {
        await message.ack();
      });
      await connector.start();
      await flush();

      expect(reported[0]?.message).toBe(
        "[SQS/OrderedListener] Failed to ack a message",
      );
    });
  });

  describe("failure options", () => {
    it("gives a nacked message the nack visibility it is configured with", async () => {
      deliver([{ Body: "payload", ReceiptHandle: "r-1" }]);
      const connector = new SqsOrderedListener({
        queueName: "events.fifo",
        region: "us-east-1",
        nackVisibilitySeconds: 30,
      });
      running.push(connector);
      connector.onMessage(async (message) => message.nack());

      await connector.start();
      await waitUntil(
        () =>
          client.commandsOfType("ChangeMessageVisibilityCommand").length > 0,
      );

      expect(
        client.commandsOfType("ChangeMessageVisibilityCommand")[0],
      ).toMatchObject({ input: { VisibilityTimeout: 30 } });
    });

    it("discards a message past maxDeliveries", async () => {
      deliver([
        {
          Body: "poison",
          ReceiptHandle: "r-1",
          Attributes: { ApproximateReceiveCount: "6" },
        },
      ]);
      const onDiscard = vi.fn();
      const connector = new SqsOrderedListener({
        queueName: "commands.fifo",
        region: "us-east-1",
        maxDeliveries: 5,
        onDiscard,
      });
      running.push(connector);
      connector.onMessage(async () => {});

      await connector.start();
      await waitUntil(() => onDiscard.mock.calls.length > 0);

      expect(onDiscard.mock.calls[0]?.[1]).toBe(6);
    });
  });

  describe("start", () => {
    it("creates the queue when asked to", async () => {
      const connector = listener();
      connector.onMessage(async () => {});

      await connector.start();

      expect(connector.status).toBe("STARTED");
    });

    it("wraps a failure to resolve with the queue that failed", async () => {
      client.send.mockRejectedValueOnce(new Error("AccessDenied"));
      const connector = listener();
      connector.onMessage(async () => {});

      await expect(connector.start()).rejects.toThrow(
        '[SQS/OrderedListener] Failed to start for queue "commands.fifo"',
      );
    });
  });

  describe("stop", () => {
    it("stops polling and destroys the client", async () => {
      const connector = await started(async () => {});

      await connector.stop();
      const callsAtStop = client.commandsOfType("ReceiveMessageCommand").length;
      await flush();

      expect(connector.status).toBe("STOPPED");
      expect(client.destroy).toHaveBeenCalledTimes(1);
      expect(client.commandsOfType("ReceiveMessageCommand").length).toBe(
        callsAtStop,
      );
    });

    it("does nothing when it never started", async () => {
      await listener().stop();

      expect(client.destroy).not.toHaveBeenCalled();
    });
  });
});
