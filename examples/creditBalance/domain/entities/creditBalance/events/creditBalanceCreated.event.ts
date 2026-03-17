import { DomainEvent } from "../../../../../../src";

export interface CreditBalanceCreatedPayload {
  organizationId: string;
  subCreditBalance: number;
  lockedBalance: number;
  purchasedCreditBalance: number;
}

export class CreditBalanceCreated extends DomainEvent<
  "CREDIT_BALANCE_CREATED",
  1,
  CreditBalanceCreatedPayload
> {
  constructor(entityId: string, payload: CreditBalanceCreatedPayload) {
    super({ name: "CREDIT_BALANCE_CREATED", version: 1, entityId, payload });
  }
}
