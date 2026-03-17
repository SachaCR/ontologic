import { DomainEventInterface } from "../../../../src";

import { CreditBalanceRepository } from "../../creditBalanceRepository";
import { CreditBalance } from "../entities/creditBalance";

const creditBalanceRepository = new CreditBalanceRepository();

export async function createBalanceWithCredits(
  organizationId: string,
  amount: number,
) {
  const domainEvents: DomainEventInterface[] = [];

  const { creditBalance, creationEvent } = CreditBalance.create({
    organizationId,
  });

  domainEvents.push(creationEvent);

  const creditEvent = creditBalance.credit({
    amount,
  });

  domainEvents.push(creditEvent);

  const result = await creditBalanceRepository.saveWithEvents(
    creditBalance,
    domainEvents,
  );

  if (result.isErr()) {
    throw result.error;
  }

  return creditBalance.readState();
}
