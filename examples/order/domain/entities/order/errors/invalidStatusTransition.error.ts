import { DomainError } from "../../../../../../src";

const NAME = "INVALID_STATUS_TRANSITION";

interface InvalidStatusTransitionContext {
  currentStatus: string;
  expectedStatus: string;
}

export class InvalidStatusTransition extends DomainError<
  typeof NAME,
  InvalidStatusTransitionContext
> {
  constructor(message: string, context: InvalidStatusTransitionContext) {
    super({
      message,
      name: NAME,
      context,
    });

    Object.setPrototypeOf(this, InvalidStatusTransition.prototype);
  }
}
