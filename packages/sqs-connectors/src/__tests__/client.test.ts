import { describe, it, expect, vi } from "vitest";
import type { SQSClient } from "@aws-sdk/client-sqs";

import { rejectionOf } from "./helpers/sqsClientMock";
import {
  assertFifoQueueName,
  assertStandardQueueName,
  assertOrderingKey,
  createSqsClient,
  resolveQueueUrl,
} from "../client";

/**
 * No module mocking here. `createSqsClient` only constructs — an SQSClient opens
 * no connection — and `resolveQueueUrl` takes its client as a parameter, which
 * makes it the cleanest seam in the package: a plain object covers every path.
 */
function clientStub(send: (command: unknown) => unknown) {
  return { send: vi.fn(send) } as unknown as SQSClient & {
    send: ReturnType<typeof vi.fn>;
  };
}

describe("assertFifoQueueName", () => {
  it("accepts a name carrying the suffix", () => {
    expect(() => assertFifoQueueName("C", "commands.fifo")).not.toThrow();
  });

  it("rejects a name without it, quoting what it got", () => {
    expect(() => assertFifoQueueName("C", "commands")).toThrow(
      '[C] A FIFO queue name must end in ".fifo", got "commands"',
    );
  });

  it("is not fooled by the suffix appearing mid-name", () => {
    expect(() => assertFifoQueueName("C", "commands.fifo.bak")).toThrow();
  });
});

describe("assertOrderingKey", () => {
  it.each([1, 64, 128])("accepts a key of length %i", (length) => {
    expect(() => assertOrderingKey("C", "x".repeat(length))).not.toThrow();
  });

  it("rejects an empty key", () => {
    // SQS requires a MessageGroupId on every FIFO send.
    expect(() => assertOrderingKey("C", "")).toThrow(
      "[C] orderingKey must be 1-128 characters, got 0",
    );
  });

  it("rejects a key past the 128 character limit", () => {
    expect(() => assertOrderingKey("C", "x".repeat(129))).toThrow(
      "[C] orderingKey must be 1-128 characters, got 129",
    );
  });
});

describe("createSqsClient", () => {
  it("defaults the region", async () => {
    const client = createSqsClient({ queueName: "c.fifo" });

    await expect(client.config.region()).resolves.toBe("us-east-1");
  });

  it("uses the region it is given", async () => {
    const client = createSqsClient({
      queueName: "c.fifo",
      region: "eu-west-3",
    });

    await expect(client.config.region()).resolves.toBe("eu-west-3");
  });

  it("bounds per-request retries by default", () => {
    // There is no connect step to hang on, so maxAttempts is the only retry
    // knob the SDK exposes.
    const client = createSqsClient({ queueName: "c.fifo" });

    expect(client.config.maxAttempts).toBeDefined();
  });

  it("uses the endpoint it is given", async () => {
    const client = createSqsClient({
      queueName: "c.fifo",
      endpoint: "http://localhost:4566",
    });

    const endpoint = await client.config.endpoint?.();

    expect(endpoint?.hostname).toBe("localhost");
  });

  it("uses the credentials it is given", async () => {
    const client = createSqsClient({
      queueName: "c.fifo",
      credentials: { accessKeyId: "test", secretAccessKey: "secret" },
    });

    await expect(client.config.credentials()).resolves.toMatchObject({
      accessKeyId: "test",
    });
  });
});

describe("resolveQueueUrl", () => {
  const queueUrl = "http://localhost:4566/000000000000/commands.fifo";

  it("looks the queue up when not asked to create it", async () => {
    const client = clientStub(() => ({ QueueUrl: queueUrl }));

    const resolved = await resolveQueueUrl("C", client, {
      queueName: "commands.fifo",
    });

    expect(resolved).toBe(queueUrl);
    expect(client.send.mock.calls[0]?.[0]).toMatchObject({
      input: { QueueName: "commands.fifo" },
    });
  });

  it("creates the queue when asked", async () => {
    const client = clientStub(() => ({ QueueUrl: queueUrl }));

    await resolveQueueUrl("C", client, {
      queueName: "commands.fifo",
      ensureQueue: true,
    });

    expect(client.send.mock.calls[0]?.[0]).toMatchObject({
      input: { QueueName: "commands.fifo" },
    });
  });

  it("creates it as a FIFO queue that deduplicates on content", async () => {
    // The publisher sends no MessageDeduplicationId — it only ever sees an
    // opaque string — so the queue has to derive one by hashing the body.
    const client = clientStub(() => ({ QueueUrl: queueUrl }));

    await resolveQueueUrl("C", client, {
      queueName: "commands.fifo",
      ensureQueue: true,
    });

    expect(client.send.mock.calls[0]?.[0]).toMatchObject({
      input: {
        Attributes: {
          FifoQueue: "true",
          ContentBasedDeduplication: "true",
        },
      },
    });
  });

  it("creates a standard queue without FIFO attributes", async () => {
    const client = clientStub(() => ({ QueueUrl: queueUrl }));

    await resolveQueueUrl("C", client, {
      queueName: "events",
      ensureQueue: true,
    });

    expect(client.send.mock.calls[0]?.[0]).toMatchObject({
      input: { Attributes: { VisibilityTimeout: "30" } },
    });
  });

  it("gives a standard queue no FifoQueue attribute", async () => {
    const client = clientStub(() => ({ QueueUrl: queueUrl }));

    await resolveQueueUrl("C", client, {
      queueName: "events",
      ensureQueue: true,
    });

    const command = client.send.mock.calls[0]?.[0] as {
      input: { Attributes: Record<string, string> };
    };

    expect(Object.keys(command.input.Attributes)).toEqual([
      "VisibilityTimeout",
    ]);
  });

  it("defaults the visibility timeout to 30 seconds", async () => {
    const client = clientStub(() => ({ QueueUrl: queueUrl }));

    await resolveQueueUrl("C", client, {
      queueName: "commands.fifo",
      ensureQueue: true,
    });

    expect(client.send.mock.calls[0]?.[0]).toMatchObject({
      input: { Attributes: { VisibilityTimeout: "30" } },
    });
  });

  it("uses the visibility timeout it is given", async () => {
    const client = clientStub(() => ({ QueueUrl: queueUrl }));

    await resolveQueueUrl("C", client, {
      queueName: "commands.fifo",
      ensureQueue: true,
      visibilityTimeoutSeconds: 120,
    });

    expect(client.send.mock.calls[0]?.[0]).toMatchObject({
      input: { Attributes: { VisibilityTimeout: "120" } },
    });
  });

  it("fails when a lookup returns no url", async () => {
    const client = clientStub(() => ({}));

    await expect(
      resolveQueueUrl("C", client, { queueName: "commands.fifo" }),
    ).rejects.toThrow('[C] Failed to resolve queue "commands.fifo"');
  });

  it("fails when a creation returns no url", async () => {
    const client = clientStub(() => ({}));

    await expect(
      resolveQueueUrl("C", client, {
        queueName: "commands.fifo",
        ensureQueue: true,
      }),
    ).rejects.toThrow('[C] Failed to resolve queue "commands.fifo"');
  });

  it("keeps the driver error as the cause", async () => {
    const denied = new Error("AccessDenied");
    const client = clientStub(() => {
      throw denied;
    });

    const failure = await rejectionOf(
      resolveQueueUrl("C", client, { queueName: "commands.fifo" }),
    );

    expect(failure.cause).toBe(denied);
  });
});

describe("assertStandardQueueName", () => {
  it("accepts a name without the FIFO suffix", () => {
    expect(() => assertStandardQueueName("C", "events")).not.toThrow();
  });

  it("rejects a FIFO name, pointing at the ordered connector", () => {
    expect(() => assertStandardQueueName("C", "events.fifo")).toThrow(
      '[C] A standard queue name must not end in ".fifo", got "events.fifo". Use the ordered connector for a FIFO queue',
    );
  });
});
