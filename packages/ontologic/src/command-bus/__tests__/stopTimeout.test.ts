import { afterEach, describe, it, expect, vi } from "vitest";

import { DEFAULT_STOP_TIMEOUT_MS, settlesWithin } from "../stopTimeout";

afterEach(() => {
  vi.useRealTimers();
});

describe("settlesWithin", () => {
  it("defaults the stop limit to 2 minutes", () => {
    expect(DEFAULT_STOP_TIMEOUT_MS).toBe(120_000);
  });

  it("resolves true when the work settles in time", async () => {
    await expect(settlesWithin(Promise.resolve(), 1000)).resolves.toBe(true);
  });

  it("resolves true when the work rejects in time", async () => {
    await expect(
      settlesWithin(Promise.reject(new Error("boom")), 1000),
    ).resolves.toBe(true);
  });

  it("resolves false once the limit elapses first", async () => {
    vi.useFakeTimers();

    const settled = settlesWithin(new Promise(() => {}), 1000);
    await vi.advanceTimersByTimeAsync(1000);

    await expect(settled).resolves.toBe(false);
  });

  it("clears its timer when the work settles first", async () => {
    vi.useFakeTimers();

    await settlesWithin(Promise.resolve(), 1000);

    expect(vi.getTimerCount()).toBe(0);
  });
});
