import { describe, it, expect, beforeEach, vi } from "vitest";

import { SqsOrderedPublisher } from "../orderedPublisher";

import {
  createSqsClientMock,
  QUEUE_URL,
  type SqsClientMock,
} from "./helpers/sqsClientMock";

// vitest 4 wants a real class for a constructor mock. Returning an object from
// a constructor replaces `this`, which is what lets every connector share the
// one stub the test holds.
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

beforeEach(() => {
  client = createSqsClientMock();
  client.respondTo("CreateQueueCommand", { QueueUrl: QUEUE_URL });
  client.respondTo("GetQueueUrlCommand", { QueueUrl: QUEUE_URL });
  clientRef.current = client;
});

function publisher(overrides?: { queueName?: string; ensureQueue?: boolean }) {
  return new SqsOrderedPublisher({
    queueName: overrides?.queueName ?? "commands.fifo",
    region: "us-east-1",
    ...(overrides?.ensureQueue === undefined
      ? {}
      : { ensureQueue: overrides.ensureQueue }),
  });
}

describe("SqsOrderedPublisher", () => {
  it("identifies itself as an ordered publisher", () => {
    expect(publisher().kind).toBe("ordered-publisher");
  });

  it("starts stopped", () => {
    expect(publisher().status).toBe("STOPPED");
  });

  it("reports the queue name, not the resolved url", async () => {
    const connector = publisher();
    await connector.start();

    expect(connector.topicName()).toBe("commands.fifo");
  });

  describe("construction", () => {
    it("rejects a queue name without the FIFO suffix", () => {
      // Caught where the typo was made rather than on the first publish.
      expect(() => publisher({ queueName: "commands" })).toThrow(
        '[SQS/OrderedPublisher] A FIFO queue name must end in ".fifo", got "commands"',
      );
    });

    it("accepts a FIFO queue name", () => {
      expect(() => publisher({ queueName: "orders.fifo" })).not.toThrow();
    });
  });

  describe("start", () => {
    it("resolves the queue url up front", async () => {
      // So a missing queue fails at boot, not on the first command sent.
      const connector = publisher();

      await connector.start();

      expect(client.commandsOfType("GetQueueUrlCommand")).toHaveLength(1);
      expect(connector.status).toBe("STARTED");
    });

    it("creates the queue when asked to", async () => {
      await publisher({ ensureQueue: true }).start();

      expect(client.commandsOfType("CreateQueueCommand")).toHaveLength(1);
      expect(client.commandsOfType("GetQueueUrlCommand")).toHaveLength(0);
    });

    it("resolves only once across repeated starts", async () => {
      const connector = publisher();

      await connector.start();
      await connector.start();

      expect(client.commandsOfType("GetQueueUrlCommand")).toHaveLength(1);
    });

    it("wraps a failure to resolve", async () => {
      client.send.mockRejectedValueOnce(new Error("AccessDenied"));

      await expect(publisher().start()).rejects.toThrow(
        "[SQS/OrderedPublisher] Failed to start",
      );
    });
  });

  describe("publish", () => {
    it("sends the message body to the resolved queue", async () => {
      const connector = publisher();
      await connector.start();

      await connector.publish("payload", { orderingKey: "order-1" });

      expect(client.commandsOfType("SendMessageCommand")[0]).toMatchObject({
        input: { QueueUrl: QUEUE_URL, MessageBody: "payload" },
      });
    });

    it("carries the ordering key as the message group", async () => {
      // This mapping is the whole reason to be on FIFO: SQS holds back the rest
      // of a group until the in-flight message is deleted.
      const connector = publisher();
      await connector.start();

      await connector.publish("payload", { orderingKey: "order-1" });

      expect(client.commandsOfType("SendMessageCommand")[0]).toMatchObject({
        input: { MessageGroupId: "order-1" },
      });
    });

    it("sends no deduplication id", async () => {
      // Deliberate: the connector only sees an opaque string and cannot read the
      // command's id, so the queue's ContentBasedDeduplication does the work.
      // Setting one here would silently take over and break that.
      const connector = publisher();
      await connector.start();

      await connector.publish("payload", { orderingKey: "order-1" });

      const [command] = client.commandsOfType("SendMessageCommand") as {
        input: Record<string, unknown>;
      }[];

      expect(command?.input["MessageDeduplicationId"]).toBeUndefined();
    });

    it("refuses to publish before it is started", async () => {
      await expect(
        publisher().publish("payload", { orderingKey: "order-1" }),
      ).rejects.toThrow("[SQS/OrderedPublisher] Not started");
    });

    it.each([
      ["an empty", "", 0],
      ["an over-long", "x".repeat(129), 129],
    ])("rejects %s ordering key", async (_label, orderingKey, length) => {
      const connector = publisher();
      await connector.start();

      await expect(
        connector.publish("payload", { orderingKey }),
      ).rejects.toThrow(
        `[SQS/OrderedPublisher] orderingKey must be 1-128 characters, got ${length}`,
      );
    });

    it("checks the ordering key before the started guard", async () => {
      // Both are wrong on an unstarted publisher with an empty key; the key
      // error is the one that names the caller's actual mistake.
      await expect(
        publisher().publish("payload", { orderingKey: "" }),
      ).rejects.toThrow("orderingKey must be 1-128 characters");
    });

    it("wraps a send failure with the queue that failed", async () => {
      const connector = publisher();
      await connector.start();
      client.send.mockRejectedValueOnce(new Error("Throttled"));

      await expect(
        connector.publish("payload", { orderingKey: "order-1" }),
      ).rejects.toThrow(
        '[SQS/OrderedPublisher] Failed to publish to queue "commands.fifo"',
      );
    });
  });

  describe("stop", () => {
    it("destroys the client", async () => {
      const connector = publisher();
      await connector.start();

      await connector.stop();

      expect(client.destroy).toHaveBeenCalledTimes(1);
      expect(connector.status).toBe("STOPPED");
    });

    it("does nothing when it never started", async () => {
      await publisher().stop();

      expect(client.destroy).not.toHaveBeenCalled();
    });

    it("forgets the queue url, so publishing needs a restart", async () => {
      const connector = publisher();
      await connector.start();
      await connector.stop();

      await expect(
        connector.publish("payload", { orderingKey: "order-1" }),
      ).rejects.toThrow("[SQS/OrderedPublisher] Not started");
    });
  });

  it("has an onError that never fires", async () => {
    // There is no background work and no client-level error event: every
    // failure surfaces as a thrown error from publish, start or stop.
    const connector = publisher();
    const reported: Error[] = [];
    connector.onError((error) => reported.push(error));
    await connector.start();
    client.send.mockRejectedValueOnce(new Error("Throttled"));

    await connector.publish("x", { orderingKey: "k" }).catch(() => {});

    expect(reported).toEqual([]);
  });
});
