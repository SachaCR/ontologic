import { Result, UseCase, err, ok } from "../../../..";

import { CreditBalanceRepository } from "../../creditBalance.repository";
import { CreditBalanceState } from "../entities/creditBalance/creditBalance.entity";
import { ReadBalanceQuery } from "./queries/readBalance.query";
import { EntityNotFound } from "./errors/entityNotFound.error";

/**
 * A read: it is declared over a `Query` rather than a `Command`, and it never
 * calls `save`. The action's kind is what says so — not the function name, and
 * not the absence of a write buried in the body.
 */
export class ReadBalanceUseCase implements UseCase<
  ReadBalanceQuery,
  CreditBalanceState,
  EntityNotFound
> {
  constructor(private readonly creditBalances: CreditBalanceRepository) {}

  async execute(
    query: ReadBalanceQuery,
  ): Promise<Result<CreditBalanceState, EntityNotFound>> {
    const { id } = query.payload;

    const resultGetById = await this.creditBalances.getById(id);

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
}
