import { describe, it, expect } from "vitest";

import { DomainEntity } from "../domainEntity";
import { BaseDomainInvariant } from "../domainInvariant";

interface BalanceState {
  amount: number;
  ledger: { id: string; delta: number }[];
}

class Balance extends DomainEntity<BalanceState> {
  static make(amount: number, ledger: BalanceState["ledger"] = []): Balance {
    const balance = new Balance("balance-1", { amount, ledger });
    balance.addInvariant(positiveAmount);
    return balance;
  }

  credit(delta: number) {
    this.state.amount += delta;
    this.state.ledger.push({ id: `entry-${this.state.ledger.length}`, delta });
  }

  corrupt(amount: number) {
    this.state.amount = amount;
  }
}

const positiveAmount = new BaseDomainInvariant<BalanceState>(
  "Amount must be >= 0",
  (state) => state.amount >= 0,
);

describe("DomainEntity.unsafeReadState", () => {
  it("returns the state without cloning", () => {
    const balance = Balance.make(100, [{ id: "e0", delta: 100 }]);

    const view = balance.unsafeReadState();
    const viewAgain = balance.unsafeReadState();

    expect(view).toBe(viewAgain);
    expect(view.ledger).toBe(viewAgain.ledger);
  });

  it("still runs invariant checks", () => {
    const balance = Balance.make(100);
    balance.corrupt(-1);

    expect(() => balance.unsafeReadState()).toThrow(/Corrupted state/);
  });

  it("returns the live internal state, so mutations bleed through (documented hazard)", () => {
    const balance = Balance.make(50);

    const view = balance.unsafeReadState() as BalanceState;
    view.amount = 999;

    expect(balance.unsafeRawState().amount).toBe(999);
  });
});

describe("DomainEntity.unsafeRawState", () => {
  it("returns the state without cloning", () => {
    const balance = Balance.make(10);

    expect(balance.unsafeRawState()).toBe(balance.unsafeRawState());
  });

  it("does NOT run invariant checks", () => {
    const balance = Balance.make(100);
    balance.corrupt(-1);

    expect(() => balance.unsafeRawState()).not.toThrow();
    expect(balance.unsafeRawState().amount).toBe(-1);
  });
});

describe("DomainEntity.readState (regression)", () => {
  it("returns a deep clone disconnected from the entity", () => {
    const balance = Balance.make(50, [{ id: "e0", delta: 50 }]);

    const snapshot = balance.readState();
    snapshot.amount = 999;
    snapshot.ledger.push({ id: "tampered", delta: 1 });

    const fresh = balance.readState();
    expect(fresh.amount).toBe(50);
    expect(fresh.ledger).toHaveLength(1);
  });
});
