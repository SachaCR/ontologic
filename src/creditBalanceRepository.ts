import { CreditBalanceState, CreditBalance } from './creditBalance';
import { InMemoryRepository } from './inMemoryRepository';

export class CreditBalanceRepository extends InMemoryRepository<CreditBalanceState, CreditBalance> {
  constructor() {
    super(CreditBalance.fromState);
  }
}

