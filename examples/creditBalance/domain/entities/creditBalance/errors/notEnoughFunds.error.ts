import { DomainError } from "../../../../../../src";

const NAME = "NOT_ENOUGH_FUNDS";

interface NotEnoughFundsContext {
  available: number;
  amount: number;
}

export class NotEnoughFunds extends DomainError<
  typeof NAME,
  NotEnoughFundsContext
> {
  constructor(message: string, context: NotEnoughFundsContext) {
    super({
      message: message,
      name: NAME,
      context,
    });

    Object.setPrototypeOf(this, NotEnoughFunds.prototype);
  }
}
