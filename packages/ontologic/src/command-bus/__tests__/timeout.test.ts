import { describe, it, expect, afterEach, vi } from "vitest";

import { waitForTimeout } from "../timeout";

afterEach(() => {
  vi.useRealTimers();
});

describe("waitForTimeout", () => {
  it("resolves with a COMMAND_TIMEOUT failure once the delay elapses", async () => {
    const response = await waitForTimeout(1, "cmd-1").promise;

    expect(response).toEqual({
      commandId: "cmd-1",
      result: "FAILURE",
      error: {
        name: "TIMEOUT_ERROR",
        code: "COMMAND_TIMEOUT",
        message: expect.stringContaining("exceeded the expected timeout (1ms)"),
        stack: expect.any(String),
        context: { commandId: "cmd-1" },
      },
    });
  });

  it("clears its timer when cancelled", () => {
    vi.useFakeTimers();

    const commandTimeout = waitForTimeout(10000, "cmd-1");
    expect(vi.getTimerCount()).toBe(1);

    commandTimeout.cancel();

    expect(vi.getTimerCount()).toBe(0);
  });

  it("never resolves once cancelled", async () => {
    vi.useFakeTimers();

    const commandTimeout = waitForTimeout(10, "cmd-1");

    let settled = false;
    void commandTimeout.promise.then(() => {
      settled = true;
    });

    commandTimeout.cancel();
    await vi.advanceTimersByTimeAsync(1000);

    expect(settled).toBe(false);
  });

  it("is safe to cancel twice", () => {
    vi.useFakeTimers();

    const commandTimeout = waitForTimeout(10000, "cmd-1");

    commandTimeout.cancel();

    expect(() => commandTimeout.cancel()).not.toThrow();
  });

  it("is safe to cancel after it has already resolved", async () => {
    const commandTimeout = waitForTimeout(1, "cmd-1");

    await commandTimeout.promise;

    expect(() => commandTimeout.cancel()).not.toThrow();
  });
});
