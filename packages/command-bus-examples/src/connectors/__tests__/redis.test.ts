import { describe } from "vitest";

import {
  testCommandBusConnectors,
  type ConnectorContractHarness,
} from "./contract";
import { type CommandBusConnectors } from "../../commandBus";
import { RedisOrderedListener } from "../redis/orderedListener";
import { RedisOrderedPublisher } from "../redis/orderedPublisher";
import { RedisListener } from "../redis/listener";
import { RedisDynamicPublisher } from "../redis/dynamicPublisher";

/**
 * Opt-in: these tests need a reachable Redis, so they are skipped unless
 * REDIS_URL is set. Defaulting to localhost would make `pnpm test` red for
 * anyone — CI included — who does not happen to have one running.
 *
 *   REDIS_URL=redis://127.0.0.1:6379 pnpm --filter command-bus-examples test
 */
const REDIS_URL = process.env["REDIS_URL"];

/**
 * The Redis half of a command bus.
 *
 * Note the asymmetry, which is the whole design rather than an oversight:
 * commands go through a *stream* with a consumer group, because a command is
 * not volatile — someone is blocked waiting for its answer, and it must survive
 * a handler crashing. Responses go through *pub/sub*, because by the time one
 * is late its caller has already timed out, so there is nothing worth
 * redelivering.
 */
export class RedisCommandBusConnectors implements CommandBusConnectors {
  commandOrderedListener: RedisOrderedListener;
  commandOrderedPublisher: RedisOrderedPublisher;
  responseListener: RedisListener;
  responseDynamicPublisher: RedisDynamicPublisher;

  constructor(params: { redisUrl: string; namespace: string }) {
    const commandTopic = `commands-${params.namespace}`;
    const responseTopic = `responses-${params.namespace}`;

    this.commandOrderedListener = new RedisOrderedListener({
      topicName: commandTopic,
      redisUrl: params.redisUrl,
      // Caps how long stop() waits on the read loop, so teardown between tests
      // stays quick.
      blockMs: 200,
    });

    this.commandOrderedPublisher = new RedisOrderedPublisher({
      topicName: commandTopic,
      redisUrl: params.redisUrl,
    });

    this.responseListener = new RedisListener({
      topicName: responseTopic,
      redisUrl: params.redisUrl,
    });

    this.responseDynamicPublisher = new RedisDynamicPublisher({
      redisUrl: params.redisUrl,
    });
  }

  /**
   * Closes every client, whatever state it reached.
   *
   * `stop()` returns early on a connector that never started, so this is safe
   * to call after a partial start as well as a clean run. Failures are
   * swallowed: a teardown problem must not mask the assertion that already
   * failed.
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
    // A namespace per test. The stream, its consumer group and its pending list
    // all outlive a single test, so sharing one topic would leave each test
    // draining whatever the last one left behind.
    counter += 1;

    return new RedisCommandBusConnectors({
      redisUrl: REDIS_URL ?? "redis://127.0.0.1:6379",
      namespace: `${process.pid}-${Date.now()}-${counter}`,
    });
  },

  destroy: (connectors) =>
    (connectors as RedisCommandBusConnectors).disconnect(),

  // A real broker over a socket, against the in-process fake's 2s default.
  timeout: 10_000,
};

describe.skipIf(!REDIS_URL)("redis (set REDIS_URL to run)", () => {
  testCommandBusConnectors("redis", harness);
});
