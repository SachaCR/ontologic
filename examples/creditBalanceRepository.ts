import { InMemoryRepository } from '../src/inMemoryRepository';

import { CreditBalanceState, CreditBalance } from './creditBalance';

export class CreditBalanceRepository extends InMemoryRepository<CreditBalanceState, CreditBalance> {
  constructor() {
    super(CreditBalance.fromState);
  }
}

