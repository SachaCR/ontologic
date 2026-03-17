import { DomainEvent } from "../../../../../../src";

export interface CreditBalanceDebitedPayload {
  amount: number;
}

export class CreditBalanceDebited extends DomainEvent<
  "CREDIT_BALANCE_DEBITED",
  1,
  CreditBalanceDebitedPayload
> {
  constructor(entityId: string, payload: CreditBalanceDebitedPayload) {
    super({ name: "CREDIT_BALANCE_DEBITED", version: 1, entityId, payload });
  }
}
