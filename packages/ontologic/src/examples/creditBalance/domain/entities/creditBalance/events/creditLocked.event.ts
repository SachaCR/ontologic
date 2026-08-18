import { DomainEvent } from "../../../../../..";

export interface CreditLockedPayload {
  amount: number;
}

export class CreditLocked extends DomainEvent<
  "CREDIT_LOCKED",
  1,
  CreditLockedPayload
> {
  constructor(entityId: string, payload: CreditLockedPayload) {
    super({ name: "CREDIT_LOCKED", version: 1, entityId, payload });
  }
}
