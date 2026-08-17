import { BaseDomainInvariant } from "ontologic";

import { SubscriptionState } from "../subscription.entity";

/**
 * One invariant per file, exported as `const <name>Invariant`.
 *
 * Invariants describe internal consistency of the model and are checked on every
 * state read — not input validation, which belongs at the system boundary.
 *
 * Check one manually with `invariant.complyWith(state).isCompliant`.
 * Combine them with `.and()` / `.or()` / `.not()` / `.xor()` / `.andNot()`.
 */
export const subscriptionHasPlanInvariant =
  new BaseDomainInvariant<SubscriptionState>(
    "Subscription Has A Plan",
    (state) => state.planId.length > 0,
  );
