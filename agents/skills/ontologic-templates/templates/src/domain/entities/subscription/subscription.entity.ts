import { randomUUID } from "node:crypto";

import { DomainEntity, Result, ok, err } from "ontologic";

import { InvalidStatusTransition } from "./errors/invalidStatusTransition.error";
import { SubscriptionCreated } from "./events/subscriptionCreated.event";
import { SubscriptionActivated } from "./events/subscriptionActivated.event";
import { subscriptionHasPlanInvariant } from "./invariants/subscriptionHasPlan";

// Re-export this aggregate's errors so use cases can import the state type and
// the errors from a single path.
export { InvalidStatusTransition } from "./errors/invalidStatusTransition.error";

export type SubscriptionStatus = "PENDING" | "ACTIVE" | "CANCELLED";

export interface SubscriptionState {
  id: string;
  customerId: string;
  planId: string;
  status: SubscriptionStatus;
  activatedAt?: string;
}

export class Subscription extends DomainEntity<SubscriptionState> {
  // Private: construction goes through `create` or `fromState`, never `new`.
  private constructor(id: string, state: SubscriptionState) {
    super(id, state);

    // Attached here so they hold on both the creation and rehydration paths.
    this.addInvariant(subscriptionHasPlanInvariant);
  }

  /** Rehydration. This is the mapper you hand to the repository. */
  static fromState(id: string, state: SubscriptionState): Subscription {
    return new Subscription(id, state);
  }

  /** Creation. Returns the entity AND the event recording its birth. */
  static create(params: { customerId: string; planId: string }): {
    subscription: Subscription;
    creationEvent: SubscriptionCreated;
  } {
    const id = randomUUID();

    const creationEvent = new SubscriptionCreated(id, {
      customerId: params.customerId,
      planId: params.planId,
      status: "PENDING",
    });

    const subscription = new Subscription(id, {
      id,
      ...creationEvent.payload,
    });

    return { subscription, creationEvent };
  }

  /**
   * Behavior: guard first, mutate `this.state`, return the event.
   *
   * Domain failures are RETURNED as `err(...)`, never thrown. No I/O in here.
   */
  activate(params: {
    activatedAt: string;
  }): Result<SubscriptionActivated, InvalidStatusTransition> {
    if (this.state.status !== "PENDING") {
      return err(
        new InvalidStatusTransition(
          "Cannot activate a subscription that is not PENDING",
          {
            currentStatus: this.state.status,
            expectedStatus: "PENDING",
          },
        ),
      );
    }

    this.state.status = "ACTIVE";
    this.state.activatedAt = params.activatedAt;

    return ok(
      new SubscriptionActivated(this.id(), {
        status: "ACTIVE",
        activatedAt: params.activatedAt,
      }),
    );
  }
}
