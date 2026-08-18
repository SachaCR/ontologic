import { DomainError } from "ontologic";

// The name is a module-level const so `typeof NAME` gives the literal type used
// as the discriminant in `switch (result.error.name)`.
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
    super({ message, name: NAME, context });

    // REQUIRED. DomainError's constructor sets the prototype to
    // DomainError.prototype, so without this line
    // `err instanceof InvalidStatusTransition` is false.
    Object.setPrototypeOf(this, InvalidStatusTransition.prototype);
  }
}
