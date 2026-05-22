import { CreditBalanceRepository } from "../../creditBalance.repository";
import { CreditBalance } from "../entities/creditBalance/creditBalance.entity";
import { CreditBalanceEvent } from "../entities/creditBalance/events/creditBalancesEvents";

const creditBalanceRepository = new CreditBalanceRepository();

export async function createBalanceWithCredits(
  organizationId: string,
  amount: number,
) {
  const domainEvents: CreditBalanceEvent[] = [];

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
