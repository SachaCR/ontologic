import { DomainEvent } from "../../../../../../src";

export interface SubCreditResetedPayload {
  amount: number;
}

export class SubCreditReseted extends DomainEvent<
  "SUB_CREDIT_RESETED",
  1,
  SubCreditResetedPayload
> {
  constructor(entityId: string, payload: SubCreditResetedPayload) {
    super({ name: "SUB_CREDIT_RESETED", version: 1, entityId, payload });
  }
}
