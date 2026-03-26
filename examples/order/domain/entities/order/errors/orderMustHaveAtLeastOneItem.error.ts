import { DomainError } from "../../../../../../src";

const NAME = "ORDER_MUST_HAVE_AT_LEAST_ONE_ITEM";

export class OrderMustHaveAtLeastOneItem extends DomainError<
  typeof NAME,
  Record<string, never>
> {
  constructor(message: string) {
    super({
      message,
      name: NAME,
      context: {},
    });

    Object.setPrototypeOf(this, OrderMustHaveAtLeastOneItem.prototype);
  }
}
