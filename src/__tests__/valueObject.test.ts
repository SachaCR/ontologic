import { describe, it, expect } from "vitest";

import { CorruptedStateError } from "../corruptedStateError";
import { BaseDomainInvariant } from "../domainInvariant";
import { ValueObject } from "../valueObject";

interface MoneyState {
  amount: number;
  currency: string;
}

class Money extends ValueObject<MoneyState> {
  static make(amount: number, currency = "USD"): Money {
    const money = new Money({ amount, currency });
    money.addInvariant(positiveAmount);
    return money;
  }

  corrupt(amount: number) {
    this.state.amount = amount;
  }
}

const positiveAmount = new BaseDomainInvariant<MoneyState>(
  "Amount must be >= 0",
  (state) => state.amount >= 0,
);

describe("ValueObject.unsafeReadState", () => {
  it("returns the state without cloning", () => {
    const money = Money.make(100);

    const view = money.unsafeReadState();
    const viewAgain = money.unsafeReadState();

    expect(view).toBe(viewAgain);
  });

  it("still runs invariant checks", () => {
    const money = Money.make(100);
    money.corrupt(-1);

    expect(() => money.unsafeReadState()).toThrow(/Corrupted state/);
  });

  it("returns the live internal state, so mutations bleed through (documented hazard)", () => {
    const money = Money.make(50);

    const view = money.unsafeReadState() as MoneyState;
    view.amount = 999;

    expect(money.unsafeRawState().amount).toBe(999);
  });
});

describe("ValueObject.unsafeRawState", () => {
  it("returns the state without cloning", () => {
    const money = Money.make(10);

    expect(money.unsafeRawState()).toBe(money.unsafeRawState());
  });

  it("does NOT run invariant checks", () => {
    const money = Money.make(100);
    money.corrupt(-1);

    expect(() => money.unsafeRawState()).not.toThrow();
    expect(money.unsafeRawState().amount).toBe(-1);
  });
});

describe("ValueObject invariant violation", () => {
  it("throws a CorruptedStateError with the class name, state and violations", () => {
    const money = Money.make(100);
    money.corrupt(-1);

    let caught: unknown;
    try {
      money.readState();
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(CorruptedStateError);
    const error = caught as CorruptedStateError<MoneyState>;
    expect(error.name).toBe("CORRUPTED_STATE");
    expect(error.entityId).toBe("Money");
    expect(error.state.amount).toBe(-1);
    expect(error.violations).toEqual([{ description: "Amount must be >= 0" }]);
  });
});

describe("ValueObject constructor (defensive copy on ingest)", () => {
  it("clones the passed-in state when no custom serialize is provided, so later mutations don't bleed in", () => {
    const seed: MoneyState = { amount: 50, currency: "USD" };
    const money = new Money(seed);

    // Mutate the object we handed to the constructor.
    seed.amount = 999;

    expect(money.readState().amount).toBe(50);
  });

  it("takes ownership without cloning when a custom serialize is provided", () => {
    const seed: MoneyState = { amount: 50, currency: "USD" };
    const money = new ValueObject<MoneyState>(seed, {
      serialize: (state) => structuredClone(state),
    });

    // With a custom serialize the value object keeps the exact reference given.
    expect(money.unsafeRawState()).toBe(seed);
  });
});

describe("ValueObject.readState (regression)", () => {
  it("returns a deep clone disconnected from the value object", () => {
    const money = Money.make(50);

    const snapshot = money.readState();
    snapshot.amount = 999;

    const fresh = money.readState();
    expect(fresh.amount).toBe(50);
  });
});
