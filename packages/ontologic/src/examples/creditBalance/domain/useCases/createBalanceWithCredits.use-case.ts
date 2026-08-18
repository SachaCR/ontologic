import { Result, UseCase, ok } from "../../../..";

import { CreditBalanceRepository } from "../../creditBalance.repository";
import {
  CreditBalance,
  CreditBalanceState,
} from "../entities/creditBalance/creditBalance.entity";
import { CreditBalanceEvent } from "../entities/creditBalance/events/creditBalancesEvents";
import { CreateBalanceWithCreditsCommand } from "./commands/createBalanceWithCredits.command";

/**
 * Two events, one atomic save — `saveWithEvents` is the unit of work, so the
 * creation and the opening credit are persisted together or not at all.
 */
export class CreateBalanceWithCreditsUseCase implements UseCase<
  CreateBalanceWithCreditsCommand,
  CreditBalanceState,
  never
> {
  constructor(private readonly creditBalances: CreditBalanceRepository) {}

  async execute(
    command: CreateBalanceWithCreditsCommand,
  ): Promise<Result<CreditBalanceState, never>> {
    const { organizationId, amount } = command.payload;

    const domainEvents: CreditBalanceEvent[] = [];

    const { creditBalance, creationEvent } = CreditBalance.create({
      organizationId,
    });

    domainEvents.push(creationEvent);

    const creditEvent = creditBalance.credit({ amount });

    domainEvents.push(creditEvent);

    const result = await this.creditBalances.saveWithEvents(
      creditBalance,
      domainEvents,
    );

    if (result.isErr()) {
      throw result.error;
    }

    return ok(creditBalance.readState());
  }
}
