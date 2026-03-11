import { BasicEntity } from './interfaces/entity';
import { DomainEvent } from './interfaces/domainEvent';

export interface CreditBalanceState {
  id: string;
  organizationId: string;
  subCreditBalance: number;
  availableBalance: number;
  lockedBalance: number;
  purchasedCreditBalance: number;
}

export class CreditBalance extends BasicEntity<CreditBalanceState> {
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
    const id = ''; // TODO: UUID

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

  debit(params: { amount: number }) {
    this.state.subCreditBalance -= params.amount;
    return {
      name: 'DEBIT',
      entityId: this.id(),
      version: 1,
      payload: {
        amount: params.amount,
      },
    };
  }
}

