import { DomainEvent } from "../../../../../../src";

export interface CreditBalanceCreditedPayload {
  amount: number;
}

export class CreditBalanceCredited extends DomainEvent<
  "CREDIT_BALANCE_CREDITED",
  1,
  CreditBalanceCreditedPayload
> {
  constructor(entityId: string, payload: CreditBalanceCreditedPayload) {
    super({ name: "CREDIT_BALANCE_CREDITED", version: 1, entityId, payload });
  }
}
