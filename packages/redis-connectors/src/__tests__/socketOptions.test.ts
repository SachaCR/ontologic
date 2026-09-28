import { describe, it, expect } from "vitest";

import { redisSocketOptions } from "../socketOptions";

const CONNECTOR = "Redis/Test";

describe("redisSocketOptions", () => {
  it("bounds a single connection attempt", () => {
    expect(redisSocketOptions(CONNECTOR).connectTimeout).toBe(2000);
  });

  it.each([
    [0, 500],
    [1, 1000],
    [2, 2000],
    [3, 4000],
    [4, 8000],
  ])("waits %ims-indexed retry for %ims", (retries, delay) => {
    const { reconnectStrategy } = redisSocketOptions(CONNECTOR);

    expect(reconnectStrategy(retries, new Error("ECONNREFUSED"))).toBe(delay);
  });

  it("gives up after the fifth retry", () => {
    const { reconnectStrategy } = redisSocketOptions(CONNECTOR);

    expect(reconnectStrategy(5, new Error("ECONNREFUSED"))).toBeInstanceOf(
      Error,
    );
  });

  it("names the connector and the cause when it gives up", () => {
    const { reconnectStrategy } = redisSocketOptions(CONNECTOR);

    const result = reconnectStrategy(5, new Error("ECONNREFUSED"));

    expect((result as Error).message).toBe(
      "[Redis/Test] Failed to connect after 5 retries, Error: ECONNREFUSED",
    );
  });

  it("keeps giving up beyond the fifth retry", () => {
    const { reconnectStrategy } = redisSocketOptions(CONNECTOR);

    expect(reconnectStrategy(9, new Error("ECONNREFUSED"))).toBeInstanceOf(
      Error,
    );
  });

  it("never reaches its own 10s ceiling", () => {
    // Documenting the real boundary rather than the one the formula implies.
    // The curve tops out at 8000 on retry 4, and retry 5 gives up, so the
    // `Math.min(..., 10_000)` arm is unreachable. It is headroom: raising the
    // give-up threshold is what would put it to work, and a lower cap would
    // flatten the backoff into a poll — which a 1000ms cap here once did.
    const { reconnectStrategy } = redisSocketOptions(CONNECTOR);

    const delays = [0, 1, 2, 3, 4].map((retries) =>
      reconnectStrategy(retries, new Error("boom")),
    );

    expect(Math.max(...(delays as number[]))).toBeLessThan(10_000);
  });
});
