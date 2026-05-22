import { InMemoryRepository } from "../..";

import { CreditBalance } from "./domain/entities/creditBalance/creditBalance.entity";
import { CreditBalanceEvent } from "./domain/entities/creditBalance/events/creditBalancesEvents";

export class CreditBalanceRepository extends InMemoryRepository<
  CreditBalance,
  CreditBalanceEvent
> {
  constructor() {
    super(CreditBalance.fromState);
  }
}
