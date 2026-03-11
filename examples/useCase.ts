import { DomainEvent } from "../src/interfaces/domainEvent";

import { CreditBalance, CreditBalanceState } from './creditBalance';
import { CreditBalanceRepository } from './creditBalanceRepository';

const creditBalanceRepository = new CreditBalanceRepository();

async function run() {
  const domainEvents: DomainEvent[] = [];

  const { creditBalance, creationEvent } = CreditBalance.create({
    organizationId: 'My Org',
  });

  domainEvents.push(creationEvent);

  const creditEvent = creditBalance.credit({
    amount: 324902,
  });

  domainEvents.push(creditEvent);

  const result = await creditBalanceRepository.saveWithEvents(creditBalance, domainEvents);

  if (result.isErr()) {
    console.log(result.error.message);
    return;
  }

  const resultGetById = await creditBalanceRepository.getById(creditBalance.id());

  if (resultGetById.isErr()) {
    console.log(resultGetById.error.message);
    console.log(resultGetById.error.code === 'ENTITY_NOT_FOUND');
    return;
  }

  const fromDB = resultGetById.value;

  fromDB.readState();

  fromDB.credit({
    amount: 39
  });
}

run().catch(err => console.log(err))

