import { randomUUID } from 'crypto';

import { Result, err, ok, DomainEntity, IDomainEvent } from '../src';

import { NotEnoughFunds } from './errors/notEnoughFunds';
import { CreditBalanceCreated } from './events/creditBalanceCreated';
import { CreditBalanceCredited } from './events/creditBalanceCredited';
import { CreditBalanceDebited } from './events/creditBalanceDebited';
import { CreditLocked } from './events/creditLocked';
import { SubCreditReseted } from './events/subCreditReseted';

export { NotEnoughFunds } from './errors/notEnoughFunds';
export { EntityNotFound } from './errors/entityNotFound';

export interface CreditBalanceState {
  id: string;
  organizationId: string;
  subCreditBalance: number;
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
    creationEvent: CreditBalanceCreated;
  } {
    const id = randomUUID();

    const creationEvent = new CreditBalanceCreated(id, {
      organizationId: params.organizationId,
      subCreditBalance: 0,
      lockedBalance: 0,
      purchasedCreditBalance: 0,
    })

    const initialState: CreditBalanceState = {
      id,
      ...creationEvent.payload(),
    };

    const creditBalance = new CreditBalance(id, initialState);

    return { creditBalance, creationEvent };
  }

  credit(params: { amount: number }): CreditBalanceCredited {
    const { amount } = params;

    this.state.subCreditBalance += amount;

    return new CreditBalanceCredited(this.id(), {
      amount: amount,
    });
  }

  resetSubCredit(params: { amount: number }): SubCreditReseted {
    const { amount } = params;

    this.state.subCreditBalance = amount;

    return new SubCreditReseted(this.id(), { amount });
  }

  lockCredits(params: { amount: number }): Result<CreditLocked, NotEnoughFunds> {
    const { amount } = params;

    if (this.state.subCreditBalance < params.amount) {
      return err(new NotEnoughFunds('You dont have enough credits to lock this amount', {
        available: this.state.subCreditBalance,
        amount,
      }));
    }

    this.state.lockedBalance += amount;

    return ok(new CreditLocked(this.id(), { amount }));
  }

  debit(params: { amount: number }): Result<IDomainEvent, NotEnoughFunds> {
    const { amount } = params;

    if (this.state.subCreditBalance < amount) {
      return err(new NotEnoughFunds('You dont have enough credits to spend this amount', {
        available: this.state.subCreditBalance,
        amount,
      }));
    }

    this.state.subCreditBalance -= amount;

    return ok(new CreditBalanceDebited(this.id(), {
      amount: amount,
    }));
  }

  available(): number {
    return this.state.subCreditBalance - this.state.lockedBalance;
  }

}

