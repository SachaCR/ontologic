import { ok, err, Result } from 'neverthrow';

import { IDomainEvent } from "../src";

import { CreditBalance, CreditBalanceState, NotEnoughFunds, EntityNotFound } from './creditBalance';
import { CreditBalanceRepository } from './creditBalanceRepository';

const creditBalanceRepository = new CreditBalanceRepository();

async function createBalanceWithCredits(organizationId: string, amount: number) {
  const domainEvents: IDomainEvent[] = [];

  const { creditBalance, creationEvent } = CreditBalance.create({
    organizationId,
  });

  domainEvents.push(creationEvent);

  const creditEvent = creditBalance.credit({
    amount,
  });

  domainEvents.push(creditEvent);

  const result = await creditBalanceRepository.saveWithEvents(creditBalance, domainEvents);

  if (result.isErr()) {
    throw result.error;
  }

  return creditBalance.readState();
}

async function readBalanceUseCase(id: string): Promise<Result<CreditBalanceState, EntityNotFound>> {
  const resultGetById = await creditBalanceRepository.getById(id);

  if (resultGetById.isErr()) {
    throw resultGetById.error;
  }

  const creditBalance = resultGetById.value;

  if (creditBalance === undefined) {
    return err(new EntityNotFound(id));
  }

  return ok(creditBalance.readState());
}

async function debitBalanceUseCase(id: string, amount: number): Promise<Result<CreditBalanceState, NotEnoughFunds | EntityNotFound>> {
  const resultGetById = await creditBalanceRepository.getById(id);

  if (resultGetById.isErr()) {
    throw resultGetById.error;
  }

  const creditBalance = resultGetById.value;

  if (creditBalance === undefined) {
    return err(new EntityNotFound(id));
  }

  const result = creditBalance.debit({ amount });

  if (result.isErr()) {
    switch (result.error.code) {
      case 'NOT_ENOUGH_FUNDS':
        return err(result.error);

      default:
        throw result.error;
    }
  }

  return ok(creditBalance.readState());
}

interface DomainError {
  message: string;
}

