import { switchGuard, ok, err, Result } from "../../../..";

import {
  CreditBalanceState,
  NotEnoughFunds,
} from "../entities/creditBalance/creditBalance.entity";
import { CreditBalanceRepository } from "../../creditBalance.repository";
import { EntityNotFound } from "./errors/entityNotFound.error";

const creditBalanceRepository = new CreditBalanceRepository();

export async function debitBalanceUseCase(
  id: string,
  amount: number,
): Promise<Result<CreditBalanceState, NotEnoughFunds | EntityNotFound>> {
  const resultGetById = await creditBalanceRepository.getById(id);

  if (resultGetById.isErr()) {
    throw resultGetById.error;
  }

  const creditBalance = resultGetById.value;

  if (creditBalance === undefined) {
    return err(
      new EntityNotFound("This credit balance does not exists", {
        entityId: id,
      }),
    );
  }

  const result = creditBalance.debit({ amount });

  if (result.isErr()) {
    switch (result.error.name) {
      case "NOT_ENOUGH_FUNDS":
        return err(result.error);

      default:
        switchGuard(result.error.name);
    }
  }

  const debitEvent = result.value;

  const saveResult = await creditBalanceRepository.saveWithEvents(
    creditBalance,
    debitEvent,
  );

  if (saveResult.isErr()) {
    throw saveResult.error;
  }

  return ok(creditBalance.readState());
}
