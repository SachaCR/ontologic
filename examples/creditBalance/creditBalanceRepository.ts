import { InMemoryRepository } from "../../src";

import {
  CreditBalance,
} from "./domain/entities/creditBalance";

export class CreditBalanceRepository extends InMemoryRepository<CreditBalance> {
  constructor() {
    super(CreditBalance.fromState);
  }
}
