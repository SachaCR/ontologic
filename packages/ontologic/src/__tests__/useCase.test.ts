import { describe, it, expect } from "vitest";

import { Command, Query } from "../action";
import { DomainError } from "../domainError";
import { Result, err, ok } from "../result";
import { UseCase } from "../useCase";

const NOT_ENOUGH_FUNDS = "NOT_ENOUGH_FUNDS";

class NotEnoughFunds extends DomainError<
  typeof NOT_ENOUGH_FUNDS,
  { requested: number; available: number }
> {
  constructor(context: { requested: number; available: number }) {
    super({ message: "Not enough funds", name: NOT_ENOUGH_FUNDS, context });

    Object.setPrototypeOf(this, NotEnoughFunds.prototype);
  }
}

class DebitBalanceCommand extends Command<
  "DEBIT_BALANCE",
  { id: string; amount: number }
> {
  constructor(payload: { id: string; amount: number }) {
    super({ name: "DEBIT_BALANCE", payload });
  }
}

class ReadBalanceQuery extends Query<"READ_BALANCE", { id: string }> {
  constructor(payload: { id: string }) {
    super({ name: "READ_BALANCE", payload });
  }
}

class DebitBalanceUseCase implements UseCase<
  DebitBalanceCommand,
  { balance: number },
  NotEnoughFunds
> {
  constructor(private readonly balances: Map<string, number>) {}

  async execute(
    command: DebitBalanceCommand,
  ): Promise<Result<{ balance: number }, NotEnoughFunds>> {
    const { id, amount } = command.payload;
    const available = this.balances.get(id) ?? 0;

    if (available < amount) {
      return err(new NotEnoughFunds({ requested: amount, available }));
    }

    this.balances.set(id, available - amount);

    return ok({ balance: available - amount });
  }
}

/** A use case with no domain failure declares `never`. */
class ReadBalanceUseCase implements UseCase<
  ReadBalanceQuery,
  { balance: number },
  never
> {
  constructor(private readonly balances: Map<string, number>) {}

  async execute(
    query: ReadBalanceQuery,
  ): Promise<Result<{ balance: number }, never>> {
    return ok({ balance: this.balances.get(query.payload.id) ?? 0 });
  }
}

describe("UseCase", () => {
  it("returns the state produced by a command", async () => {
    const useCase = new DebitBalanceUseCase(new Map([["balance-1", 100]]));

    const outcome = await useCase.execute(
      new DebitBalanceCommand({ id: "balance-1", amount: 40 }),
    );

    expect(outcome._unsafeUnwrap()).toEqual({ balance: 60 });
  });

  it("returns the domain failure instead of throwing it", async () => {
    const useCase = new DebitBalanceUseCase(new Map([["balance-1", 10]]));

    const outcome = await useCase.execute(
      new DebitBalanceCommand({ id: "balance-1", amount: 40 }),
    );

    const error = outcome._unsafeUnwrapErr();

    expect(error.name).toBe(NOT_ENOUGH_FUNDS);
    expect(error.context).toEqual({ requested: 40, available: 10 });
  });

  it("answers a query without writing", async () => {
    const balances = new Map([["balance-1", 100]]);
    const useCase = new ReadBalanceUseCase(balances);

    const outcome = await useCase.execute(
      new ReadBalanceQuery({ id: "balance-1" }),
    );

    expect(outcome._unsafeUnwrap()).toEqual({ balance: 100 });
    expect(balances.get("balance-1")).toBe(100);
  });

  it("rejects an action it was not declared over", async () => {
    const useCase = new DebitBalanceUseCase(new Map([["balance-1", 100]]));

    const query = new ReadBalanceQuery({ id: "balance-1" });

    // @ts-expect-error `DebitBalanceUseCase` is declared over a command, so a
    // query is not a valid action for it. Checked by `tsc`, not by vitest.
    const outcome = await useCase.execute(query);

    // Nothing stops the call at runtime: the query carries no `amount`, so the
    // debit quietly corrupts the balance instead of failing. The type error is
    // the only thing standing between this use case and that outcome.
    expect(outcome._unsafeUnwrap()).toEqual({ balance: NaN });
  });
});

/**
 * The error side cannot be widened away.
 *
 * `DomainError` declares a required `context` property that `Error` does not
 * have, so `Result<T, Error>` fails the `Errors` constraint. This is the whole
 * reason the constraint exists: an erased error union throws away the
 * exhaustiveness checking that makes `switchGuard` useful.
 *
 * Verified by `tsc` — `pnpm build` type-checks `__tests__`. If this stops
 * erroring, the constraint has been weakened and every use case in the
 * repository can silently go back to `Result<T, Error>`.
 */
export type WidenedErrorSide = UseCase<
  DebitBalanceCommand,
  { balance: number },
  // @ts-expect-error `Error` does not satisfy `DomainError<string, unknown>`.
  Error
>;
