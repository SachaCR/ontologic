import { InMemoryRepository } from "ontologic";

import { Subscription } from "./entities/subscription/subscription.entity";
import { SubscriptionEvent } from "./entities/subscription/events/subscriptionEvents";

/**
 * `InMemoryRepository` takes TWO type parameters: the entity and the union of
 * its domain events. The constructor argument is the `fromState` mapper it uses
 * to rehydrate entities.
 *
 * Good for tests and prototyping. It does NOT implement optimistic locking —
 * versions stay at 0 and every save succeeds. A production repository should
 * read `entity.version()` to guard the write, return `ConcurrentWriteError`
 * inside a `Result` on a mismatch, and call `entity.setVersion(n)` after a
 * successful save.
 */
export class SubscriptionRepository extends InMemoryRepository<
  Subscription,
  SubscriptionEvent
> {
  constructor() {
    super(Subscription.fromState);
  }
}
