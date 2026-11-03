import { describe, it, expect, beforeEach, vi } from "vitest";

import { SqsPublisher } from "../publisher";

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
  client.respondTo("GetQueueUrlCommand", { QueueUrl: QUEUE_URL });
  clientRef.current = client;
});

function publisher(queueName = "events") {
  return new SqsPublisher({ queueName, region: "us-east-1" });
}

describe("SqsPublisher", () => {
  it("identifies itself as a publisher", () => {
    expect(publisher().kind).toBe("publisher");
  });

  it("rejects a FIFO queue name", () => {
    expect(() => publisher("events.fifo")).toThrow(
      '[SQS/Publisher] A standard queue name must not end in ".fifo", got "events.fifo". Use the ordered connector for a FIFO queue',
    );
  });

  it("sends the message body to the resolved queue", async () => {
    const connector = publisher();
    await connector.start();

    await connector.publish("payload");

    expect(client.commandsOfType("SendMessageCommand")[0]).toMatchObject({
      input: { QueueUrl: QUEUE_URL, MessageBody: "payload" },
    });
  });

  it("sends no message group, even when given an ordering key", async () => {
    const connector = publisher();
    await connector.start();

    await connector.publish("payload", { orderingKey: "entity-1" });

    const sent = client.commandsOfType("SendMessageCommand")[0] as unknown as {
      input: Record<string, unknown>;
    };

    expect(sent.input).not.toHaveProperty("MessageGroupId");
  });

  it("refuses to publish before it is started", async () => {
    await expect(publisher().publish("payload")).rejects.toThrow(
      "[SQS/Publisher] Not started",
    );
  });
});
