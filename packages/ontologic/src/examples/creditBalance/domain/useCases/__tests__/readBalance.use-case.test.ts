import { describe, it, expect, beforeEach } from "vitest";

import { CreditBalanceRepository } from "../../../creditBalance.repository";
import { CreateBalanceWithCreditsUseCase } from "../createBalanceWithCredits.use-case";
import { ReadBalanceUseCase } from "../readBalance.use-case";
import { CreateBalanceWithCreditsCommand } from "../commands/createBalanceWithCredits.command";
import { ReadBalanceQuery } from "../queries/readBalance.query";

describe("ReadBalanceUseCase", () => {
  let repository: CreditBalanceRepository;
  let createBalance: CreateBalanceWithCreditsUseCase;
  let readBalance: ReadBalanceUseCase;

  beforeEach(() => {
    repository = new CreditBalanceRepository();
    createBalance = new CreateBalanceWithCreditsUseCase(repository);
    readBalance = new ReadBalanceUseCase(repository);
  });

  const setupBalance = async (amount: number): Promise<string> => {
    const created = await createBalance.execute(
      new CreateBalanceWithCreditsCommand({
        organizationId: "organization-1",
        amount,
      }),
    );

    return created._unsafeUnwrap().id;
  };

  it("returns the balance state for an existing credit balance", async () => {
    const id = await setupBalance(120);

    const result = await readBalance.execute(new ReadBalanceQuery({ id }));

    const state = result._unsafeUnwrap();
    expect(state.id).toBe(id);
    expect(state.organizationId).toBe("organization-1");
    expect(state.subCreditBalance).toBe(120);
  });

  it("returns ENTITY_NOT_FOUND when the credit balance does not exist", async () => {
    const result = await readBalance.execute(
      new ReadBalanceQuery({ id: "unknown-id" }),
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.name).toBe("ENTITY_NOT_FOUND");
    }
  });

  it("records no event, because answering a query writes nothing", async () => {
    const id = await setupBalance(120);
    const before = (await repository.getEvents(id))._unsafeUnwrap().length;

    await readBalance.execute(new ReadBalanceQuery({ id }));

    const after = (await repository.getEvents(id))._unsafeUnwrap().length;
    expect(after).toBe(before);
  });
});
