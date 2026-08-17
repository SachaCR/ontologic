import { Result, ok, err } from "ontologic";

import {
  Subscription,
  SubscriptionState,
} from "../entities/subscription/subscription.entity";
import { PlanNoLongerOffered } from "../entities/plan/errors/planNoLongerOffered.error";
import { SubscriptionRepository } from "../subscription.repository";
import { PlanRepository } from "../plan.repository";
import { EntityNotFound } from "./errors/entityNotFound.error";

/**
 * A use case spanning TWO aggregates — the shape to copy when a rule cannot be
 * decided from one entity's state alone.
 *
 * "A subscription may only be created for a plan that is still offered" needs
 * the Plan aggregate, so it cannot be a Subscription invariant. It lives here.
 *
 * Note the asymmetry: the Plan is READ, the Subscription is WRITTEN.
 * `saveWithEvents` is the only atomic unit available, so a use case should read
 * from as many aggregates as it needs and write to exactly one.
 */
export async function subscribeToPlanUseCase(
  input: { customerId: string; planId: string },
  dependencies: {
    subscriptions: SubscriptionRepository;
    plans: PlanRepository;
  },
): Promise<Result<SubscriptionState, EntityNotFound | PlanNoLongerOffered>> {
  const { customerId, planId } = input;
  const { subscriptions, plans } = dependencies;

  const planLookup = await plans.getById(planId);

  if (planLookup.isErr()) {
    throw planLookup.error; // infrastructure failure → throw
  }

  const plan = planLookup.value;

  // Existence needs a lookup, so it is a use-case decision, not a repository one.
  if (plan === undefined) {
    return err(new EntityNotFound("This plan does not exist", { entityId: planId }));
  }

  // A rule about ANOTHER aggregate's state. The Plan is a fact source here —
  // it is never mutated and never saved.
  if (!plan.readState().offered) {
    return err(
      new PlanNoLongerOffered("This plan is no longer offered", { planId }),
    );
  }

  const { subscription, creationEvent } = Subscription.create({
    customerId,
    planId,
  });

  const saveResult = await subscriptions.saveWithEvents(
    subscription,
    creationEvent,
  );

  if (saveResult.isErr()) {
    throw saveResult.error;
  }

  return ok(subscription.readState());
}
