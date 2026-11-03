import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { ReceivedMessage } from "ontologic";

import { SqsListener } from "../listener";

import {
  createSqsClientMock,
  QUEUE_URL,
  waitUntil,
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
let running: SqsListener[] = [];

beforeEach(() => {
  client = createSqsClientMock();
  client.respondTo("GetQueueUrlCommand", { QueueUrl: QUEUE_URL });
  clientRef.current = client;
  running = [];
});

afterEach(async () => {
  await Promise.all(running.map((listener) => listener.stop().catch(() => {})));
});

function listener(queueName = "events") {
  const created = new SqsListener({
    queueName,
    region: "us-east-1",
    waitTimeSeconds: 1,
  });
  running.push(created);
  return created;
}

/** Hands out one batch of ungrouped messages, then idles. */
function deliverOnce(bodies: string[]) {
  let delivered = false;

  client.send.mockImplementation(
    async (command: { constructor: { name: string } }) => {
      const kind = command.constructor.name;

      if (kind === "GetQueueUrlCommand") {
        return { QueueUrl: QUEUE_URL };
      }

      if (kind === "ReceiveMessageCommand") {
        if (delivered) {
          await new Promise((resolve) => setTimeout(resolve, 5));
          return {};
        }

        delivered = true;

        return {
          Messages: bodies.map((body) => ({
            Body: body,
            ReceiptHandle: `rh-${body}`,
            MessageId: `id-${body}`,
          })),
        };
      }

      return {};
    },
  );
}

describe("SqsListener", () => {
  it("identifies itself as a listener", () => {
    expect(listener().kind).toBe("listener");
  });

  it("reports the queue name", () => {
    expect(listener("events").topicName()).toBe("events");
  });

  it("rejects a FIFO queue name", () => {
    expect(() => listener("events.fifo")).toThrow(
      '[SQS/Listener] A standard queue name must not end in ".fifo", got "events.fifo". Use the ordered connector for a FIFO queue',
    );
  });

  it("handles messages in parallel", async () => {
    deliverOnce(["x", "y"]);
    const log: string[] = [];
    const connector = listener();
    connector.onMessage(async (message: ReceivedMessage) => {
      log.push(`start:${message.content}`);
      await new Promise((resolve) => setTimeout(resolve, 20));
      log.push(`end:${message.content}`);
      await message.ack();
    });

    await connector.start();
    await waitUntil(() => log.length === 4);

    expect(log.slice(0, 2).sort()).toEqual(["start:x", "start:y"]);
  });

  it("stops and destroys the client", async () => {
    const connector = listener();
    connector.onMessage(async () => {});
    await connector.start();

    await connector.stop();

    expect(client.destroy).toHaveBeenCalledTimes(1);
  });
});
