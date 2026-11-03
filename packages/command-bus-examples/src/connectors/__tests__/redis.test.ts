import { describe } from "vitest";

import {
  testCommandBusConnectors,
  type ConnectorContractHarness,
} from "./contract";
import { RedisCommandBusConnectors } from "../redis";

/**
 * Opt-in: these tests need a reachable Redis, so they are skipped unless
 * REDIS_URL is set. Defaulting to localhost would make `pnpm test` red for
 * anyone — CI included — who does not happen to have one running.
 *
 *   REDIS_URL=redis://127.0.0.1:6379 pnpm --filter command-bus-examples test
 */
const REDIS_URL = process.env["REDIS_URL"];

let counter = 0;

const harness: ConnectorContractHarness = {
  create: () => {
    // A namespace per test. The stream, its consumer group and its pending list
    // all outlive a single test, so sharing one topic would leave each test
    // draining whatever the last one left behind.
    counter += 1;

    const namespace = `${process.pid}-${Date.now()}-${counter}`;

    return new RedisCommandBusConnectors({
      redisUrl: REDIS_URL ?? "redis://127.0.0.1:6379",
      commandTopic: `commands-${namespace}`,
      responseTopic: `responses-${namespace}`,
      // Caps how long stop() waits on the read loop, so teardown between tests
      // stays quick.
      blockMs: 200,
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
