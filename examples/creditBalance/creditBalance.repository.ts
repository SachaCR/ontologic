import { InMemoryRepository } from "../../src";

import {
  CreditBalance,
} from "./domain/entities/creditBalance/creditBalance.entity";

export class CreditBalanceRepository extends InMemoryRepository<CreditBalance> {
  constructor() {
    super(CreditBalance.fromState);
  }
}
