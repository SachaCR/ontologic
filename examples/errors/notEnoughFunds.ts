import { DomainError } from '../../src';

const NAME = 'NOT_ENOUGH_FUNDS';

interface NotEnoughFundsContext {
  available: number;
  amount: number;
}

export class NotEnoughFunds extends DomainError<typeof NAME, NotEnoughFundsContext> {
  name: typeof NAME;

  constructor(message: string, context: NotEnoughFundsContext) {
    super({
      message: message,
      name: 'NOT_ENOUGH_FUNDS',
      context,
    })

    Object.setPrototypeOf(this, NotEnoughFunds.prototype);
  }
}

