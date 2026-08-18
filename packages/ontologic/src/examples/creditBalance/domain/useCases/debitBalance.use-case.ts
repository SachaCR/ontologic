import { Result, UseCase, err, ok, switchGuard } from "../../../..";

import { CreditBalanceRepository } from "../../creditBalance.repository";
import {
  CreditBalanceState,
  NotEnoughFunds,
} from "../entities/creditBalance/creditBalance.entity";
import { DebitBalanceCommand } from "./commands/debitBalance.command";
import { EntityNotFound } from "./errors/entityNotFound.error";

export class DebitBalanceUseCase implements UseCase<
  DebitBalanceCommand,
  CreditBalanceState,
  NotEnoughFunds | EntityNotFound
> {
  constructor(private readonly creditBalances: CreditBalanceRepository) {}

  async execute(
    command: DebitBalanceCommand,
  ): Promise<Result<CreditBalanceState, NotEnoughFunds | EntityNotFound>> {
    const { id, amount } = command.payload;

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

    const saveResult = await this.creditBalances.saveWithEvents(
      creditBalance,
      debitEvent,
    );

    if (saveResult.isErr()) {
      throw saveResult.error;
    }

    return ok(creditBalance.readState());
  }
}
