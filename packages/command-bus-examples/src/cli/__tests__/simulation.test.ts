import { describe, it, expect } from "vitest";

import { planSimulation, randomLatency } from "../simulation";

/** A deterministic `random`: cycles through the given values. */
function sequence(...values: number[]) {
  let index = 0;
  return () => values[index++ % values.length] as number;
}

describe("planSimulation", () => {
  it("plans as many orders as asked", () => {
    expect(planSimulation(7, 3)).toHaveLength(7);
  });

  it("only uses the emitters there are", () => {
    const emitters = new Set(planSimulation(200, 3).map((o) => o.emitter));

    expect([...emitters].every((emitter) => emitter >= 0 && emitter < 3)).toBe(
      true,
    );
  });

  it("spreads orders across every emitter", () => {
    const emitters = new Set(planSimulation(200, 3).map((o) => o.emitter));

    expect(emitters.size).toBe(3);
  });

  it("reuses order ids, so some commands share an order", () => {
    const ids = planSimulation(50, 3).map((o) => o.orderId);

    expect(new Set(ids).size).toBeLessThan(ids.length);
  });

  it("plans some empty orders, for the handler to refuse", () => {
    // emitter, order, empty?, spacing: a 0.1 lands under the 15% rate.
    const plan = planSimulation(1, 3, sequence(0, 0, 0.1, 0));

    expect(plan[0]?.items).toEqual([]);
  });

  it("gives every item a quantity between 1 and 5", () => {
    const quantities = planSimulation(100, 3).flatMap((o) =>
      o.items.map((item) => item.quantity),
    );

    expect(quantities.every((q) => q >= 1 && q <= 5)).toBe(true);
  });

  it("spaces sends by at most 300ms", () => {
    const delays = planSimulation(100, 3).map((o) => o.delayMs);

    expect(delays.every((d) => d >= 0 && d <= 300)).toBe(true);
  });

  it("stays in range when random returns its highest value", () => {
    const plan = planSimulation(1, 3, () => 0.9999999);

    expect(plan[0]).toMatchObject({ emitter: 2, orderId: "order-6" });
  });
});

describe("randomLatency", () => {
  it("returns the minimum for the lowest random value", () => {
    expect(randomLatency(500, 3000, () => 0)).toBe(500);
  });

  it("returns the maximum for the highest random value", () => {
    expect(randomLatency(500, 3000, () => 0.9999999)).toBe(3000);
  });

  it("stays within the range", () => {
    const latencies = Array.from({ length: 100 }, () =>
      randomLatency(500, 3000),
    );

    expect(latencies.every((l) => l >= 500 && l <= 3000)).toBe(true);
  });
});
