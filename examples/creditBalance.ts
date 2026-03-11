import { randomUUID } from 'crypto';

import { Result, err, ok } from 'neverthrow';

import { DomainEntity } from '../src/interfaces/entity';
import { DomainEvent } from '../src/interfaces/domainEvent';

import { NotEnoughFunds } from './errors/notEnoughFunds';

export interface CreditBalanceState {
  id: string;
  organizationId: string;
  subCreditBalance: number;
  availableBalance: number;
  lockedBalance: number;
  purchasedCreditBalance: number;
}

export class CreditBalance extends DomainEntity<CreditBalanceState> {
  private constructor(id: string, state: CreditBalanceState) {
    super(id, state);
  }

  static fromState(id: string, state: CreditBalanceState) {
    return new CreditBalance(id, state);
  }

  static create(params: { organizationId: string }): {
    creditBalance: CreditBalance;
    creationEvent: DomainEvent;
  } {
    const id = randomUUID();

    const creationEvent = {
      entityId: id,
      name: 'CREDIT_BALANCE_CREATED',
      version: 1,
      offset: 1,
      payload: {
        organizationId: params.organizationId,
        subCreditBalance: 0,
        availableBalance: 0,
        lockedBalance: 0,
        purchasedCreditBalance: 0,
      },
    };

    const initialState: CreditBalanceState = {
      ...creationEvent.payload,
      id,
      organizationId: params.organizationId,
    };

    const creditBalance = new CreditBalance(id, initialState);

    return { creditBalance, creationEvent };
  }

  credit(params: { amount: number }) {
    this.state.subCreditBalance += params.amount;

    return {
      name: 'CREDIT',
      entityId: this.id(),
      version: 1,
      payload: {
        amount: params.amount,
      },
    };
  }

  debit(params: { amount: number }): Result<DomainEvent, NotEnoughFunds> {
    if (this.state.availableBalance < params.amount) {
      return err(new NotEnoughFunds(this.state.availableBalance));
    }

    this.state.subCreditBalance -= params.amount;

    return ok({
      name: 'DEBIT',
      entityId: this.id(),
      version: 1,
      payload: {
        amount: params.amount,
      },
    });
  }
}

