import { CustomError } from '../../src';

export class NotEnoughFunds extends CustomError<'NOT_ENOUGH_FUNDS', { available: number }> {
  constructor(available: number) {
    super({
      message: 'Not Enough Funds',
      errorCode: 'NOT_ENOUGH_FUNDS',
      name: 'DOMAIN_ERROR',
      context: {
        available,
      }
    })

    Object.setPrototypeOf(this, NotEnoughFunds.prototype);
  }
}

