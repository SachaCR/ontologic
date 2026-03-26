import { DomainEvent } from "../../../../../../src";

export interface VoucherAppliedPayload {
  voucherId: string;
}

export class VoucherApplied extends DomainEvent<
  "VOUCHER_APPLIED",
  1,
  VoucherAppliedPayload
> {
  constructor(entityId: string, payload: VoucherAppliedPayload) {
    super({ name: "VOUCHER_APPLIED", version: 1, entityId, payload });
  }
}
