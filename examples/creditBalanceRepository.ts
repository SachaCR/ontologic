import { InMemoryRepository } from '../src';

import { CreditBalanceState, CreditBalance } from './creditBalance';

export class CreditBalanceRepository extends InMemoryRepository<CreditBalanceState, CreditBalance> {
  constructor() {
    super(CreditBalance.fromState);
  }
}

