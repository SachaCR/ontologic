import { describe, it, expect } from "vitest";

import {
  testCommandBusConnectors,
  type ConnectorContractHarness,
} from "./contract";
import { type CommandBusConnectors } from "../../commandBus";
import {
  SqsOrderedListener,
  SqsOrderedPublisher,
} from "@ontologics/sqs-connectors";
import {
  RedisDynamicPublisher,
  RedisListener,
} from "@ontologics/redis-connectors";

/**
 * Opt-in, and it needs *two* services: the architecture under test is SQS FIFO
 * for commands and Redis pub/sub for responses, so both have to be reachable.
 *
 *   docker run -d --rm -p 4566:4566 localstack/localstack
 *   docker run -d --rm -p 6379:6379 redis:7-alpine
 *   SQS_ENDPOINT=http://localhost:4566 REDIS_URL=redis://127.0.0.1:6379 \
 *     pnpm --filter command-bus-examples test
 */
const SQS_ENDPOINT = process.env["SQS_ENDPOINT"];
const REDIS_URL = process.env["REDIS_URL"];

/** LocalStack accepts any credentials; only the endpoint matters. */
const LOCALSTACK_CREDENTIALS = {
  accessKeyId: "test",
  secretAccessKey: "test",
};

/**
 * Commands on SQS, responses on Redis.
 *
 * The split is the point, not a limitation. A command is durable work someone
 * is blocked waiting for, so it wants a FIFO queue with real delivery
 * guarantees. A response whose caller has already timed out is worth nothing,
 * so it wants a channel that costs nothing to create and nothing to clean up —
 * and SQS has no ephemeral queue primitive to offer, while a Redis pub/sub
 * channel is not even allocated until someone subscribes.
 */
export class SqsCommandBusConnectors implements CommandBusConnectors {
  commandOrderedListener: SqsOrderedListener;
  commandOrderedPublisher: SqsOrderedPublisher;
  responseListener: RedisListener;
  responseDynamicPublisher: RedisDynamicPublisher;

  constructor(params: {
    sqsEndpoint: string;
    redisUrl: string;
    namespace: string;
  }) {
    const queueName = `commands-${params.namespace}.fifo`;

    const sqs = {
      queueName,
      region: "us-east-1",
      endpoint: params.sqsEndpoint,
      credentials: LOCALSTACK_CREDENTIALS,
      ensureQueue: true,
    };

    this.commandOrderedListener = new SqsOrderedListener({
      ...sqs,
      // Long polling would otherwise put a floor under each test; stop() aborts
      // the poll anyway, this just keeps an idle loop cheap.
      waitTimeSeconds: 1,
    });

    this.commandOrderedPublisher = new SqsOrderedPublisher(sqs);

    this.responseListener = new RedisListener({
      topicName: `responses-${params.namespace}`,
      redisUrl: params.redisUrl,
    });

    this.responseDynamicPublisher = new RedisDynamicPublisher({
      redisUrl: params.redisUrl,
    });
  }

  /**
   * Closes everything, whatever state it reached. `stop()` returns early on a
   * connector that never started, so this is safe after a partial start.
   * Failures are swallowed: a teardown problem must not mask the assertion that
   * already failed.
   */
  async disconnect(): Promise<void> {
    await Promise.all(
      [
        this.commandOrderedListener,
        this.commandOrderedPublisher,
        this.responseListener,
        this.responseDynamicPublisher,
      ].map((connector) => connector.stop().catch(() => {})),
    );
  }
}

let counter = 0;

const harness: ConnectorContractHarness = {
  create: () => {
    // A queue per test. SQS queues outlive the test that made them, and a
    // shared one would leave each test consuming whatever the last left behind.
    counter += 1;

    return new SqsCommandBusConnectors({
      sqsEndpoint: SQS_ENDPOINT ?? "http://localhost:4566",
      redisUrl: REDIS_URL ?? "redis://127.0.0.1:6379",
      namespace: `${process.pid}-${Date.now()}-${counter}`,
    });
  },

  destroy: (connectors) => (connectors as SqsCommandBusConnectors).disconnect(),

  // Queue creation plus a poll cycle is slower than Redis alone.
  timeout: 15_000,
};

describe.skipIf(!SQS_ENDPOINT || !REDIS_URL)(
  "sqs + redis (set SQS_ENDPOINT and REDIS_URL to run)",
  () => {
    testCommandBusConnectors("sqs-commands/redis-responses", harness);
  },
);

/**
 * The property that justifies choosing SQS FIFO over a Redis stream.
 *
 * A Redis consumer group spreads entries across its consumers, so per-key order
 * only survives while exactly one consumer reads the stream — every Redis
 * connector in this package carries a comment saying so. SQS holds back the
 * rest of a message group until the in-flight message is deleted, so the same
 * guarantee holds with any number of listeners. That is a claim worth a test
 * rather than a comment.
 */
describe.skipIf(!SQS_ENDPOINT)("sqs FIFO ordering", () => {
  it("keeps each ordering key in order while spreading keys across listeners", async () => {
    const queueName = `ordering-${process.pid}-${Date.now()}.fifo`;
    const sqs = {
      queueName,
      region: "us-east-1",
      endpoint: SQS_ENDPOINT ?? "http://localhost:4566",
      credentials: LOCALSTACK_CREDENTIALS,
      ensureQueue: true,
    };

    const publisher = new SqsOrderedPublisher(sqs);
    await publisher.start();

    // Published before anything consumes, so the listeners start against a full
    // queue and genuinely race for it.
    const keys = ["key-a", "key-b", "key-c"];
    for (let index = 1; index <= 4; index += 1) {
      for (const key of keys) {
        await publisher.publish(`${key}:${index}`, { orderingKey: key });
      }
    }

    const seen: { listener: string; body: string }[] = [];

    const listeners = ["L1", "L2", "L3"].map((label) => {
      // One message per receive, so all three compete. A batch of 10 would let
      // the first listener drain the queue before the others polled.
      const listener = new SqsOrderedListener({
        ...sqs,
        waitTimeSeconds: 1,
        maxMessages: 1,
      });

      listener.onError(() => {});
      listener.onMessage(async (message) => {
        seen.push({ listener: label, body: message.content });
        // Hold the group open long enough that a race would show up.
        await new Promise((resolve) => setTimeout(resolve, 100));
        await message.ack();
      });

      return listener;
    });

    try {
      await Promise.all(listeners.map((listener) => listener.start()));

      const deadline = Date.now() + 20_000;
      while (seen.length < 12 && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      expect(seen).toHaveLength(12);

      for (const key of keys) {
        const forKey = seen.filter((entry) => entry.body.startsWith(key));

        expect(forKey.map((entry) => entry.body)).toEqual([
          `${key}:1`,
          `${key}:2`,
          `${key}:3`,
          `${key}:4`,
        ]);
      }

      // And the parallelism is real: the keys did not all land on one listener.
      expect(new Set(seen.map((entry) => entry.listener)).size).toBeGreaterThan(
        1,
      );
    } finally {
      await Promise.all(
        listeners.map((listener) => listener.stop().catch(() => {})),
      );
      await publisher.stop().catch(() => {});
    }
  }, 40_000);
});
