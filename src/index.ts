import { Entity } from "./interfaces/entity";
import { InMemoryRepository } from "./inMemoryRepository";
import { DomainEvent } from "./interfaces/domainEvent";

interface CreditBalanceState {
  id: string;
  organizationId: string;
  subCreditBalance: number;
  availableBalance: number;
  lockedBalance: number;
  purchasedCreditBalance: number;
}

export class CreditBalance implements Entity<CreditBalanceState> {
  #id: string;
  #organizationId: string;
  #availableBalance: number;
  #lockedBalance: number;
  #subCreditBalance: number;
  #purchasedCreditBalance: number;

  private constructor(state: CreditBalanceState) {
    this.#id = state.id;
    this.#subCreditBalance = state.subCreditBalance;
    this.#availableBalance = state.availableBalance;
    this.#lockedBalance = state.lockedBalance;
    this.#purchasedCreditBalance = state.purchasedCreditBalance;
    this.#organizationId = state.organizationId;
  }

  id(): string {
    return this.#id;
  }

  static fromState(state: CreditBalanceState): CreditBalance {
    return new CreditBalance(state);
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

    const creditBalance = new CreditBalance(initialState);

    return { creditBalance, creationEvent };
  }

  credit(params: { amount: number }) {
    this.#subCreditBalance += params.amount;
    return {
      name: 'CREDIT',
      entityId: this.#id,
      version: 1,
      payload: {
        amount: params.amount,
      },
    };
  }

  debit(params: { amount: number }) {
    this.#subCreditBalance -= params.amount;
    return {
      name: 'DEBIT',
      entityId: this.#id,
      version: 1,
      payload: {
        amount: params.amount,
      },
    };
  }

  state(): CreditBalanceState {
    const state = {
      id: this.#id,
      organizationId: this.#organizationId,
      subCreditBalance: this.#subCreditBalance,
      availableBalance: this.#availableBalance,
      lockedBalance: this.#lockedBalance,
      purchasedCreditBalance: this.#purchasedCreditBalance,
    };

    return state;
  }
}


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

  const creditBalanceRepository = new InMemoryRepository<CreditBalance>();

  const result = await creditBalanceRepository.saveWithEvents(creditBalance, domainEvents);

  if (result.isErr()) {

    console.log(result.error.message);
    return;
  }

  const resultGetById = await creditBalanceRepository.getById(creditBalance.state().id);

  if (resultGetById.isErr()) {

    console.log(resultGetById.error.message);
    console.log(resultGetById.error.code === 'ENTITY_NOT_FOUND');
    return;
  }

  const fromDB = resultGetById.value;
  creditBalance.state();
}

run().catch(err => console.log(err))
