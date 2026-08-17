import { DomainError } from "ontologic";

const NAME = "PLAN_NO_LONGER_OFFERED";

interface PlanNoLongerOfferedContext {
  planId: string;
}

/**
 * Filed with the Plan aggregate because the error is *about* a plan — even
 * though it is raised by a Subscription use case. File an error with the
 * aggregate it describes, not the one whose flow happens to detect it.
 */
export class PlanNoLongerOffered extends DomainError<
  typeof NAME,
  PlanNoLongerOfferedContext
> {
  constructor(message: string, context: PlanNoLongerOfferedContext) {
    super({ message, name: NAME, context });

    Object.setPrototypeOf(this, PlanNoLongerOffered.prototype);
  }
}
