import { DomainError } from "../../../../../../src";

const NAME = "VOUCHER_ALREADY_APPLIED";

interface VoucherAlreadyAppliedContext {
  existingVoucherId: string;
}

export class VoucherAlreadyApplied extends DomainError<
  typeof NAME,
  VoucherAlreadyAppliedContext
> {
  constructor(message: string, context: VoucherAlreadyAppliedContext) {
    super({
      message,
      name: NAME,
      context,
    });

    Object.setPrototypeOf(this, VoucherAlreadyApplied.prototype);
  }
}
