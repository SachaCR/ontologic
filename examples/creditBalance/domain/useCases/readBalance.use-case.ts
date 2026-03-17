import { Result, err, ok } from "../../../../src";

import { CreditBalanceState } from "../entities/creditBalance/creditBalance.entity";
import { CreditBalanceRepository } from "../../creditBalance.repository";
import { EntityNotFound } from "./errors/entityNotFound";

const creditBalanceRepository = new CreditBalanceRepository();

export async function readBalanceUseCase(
  id: string,
): Promise<Result<CreditBalanceState, EntityNotFound>> {
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

  return ok(creditBalance.readState());
}
