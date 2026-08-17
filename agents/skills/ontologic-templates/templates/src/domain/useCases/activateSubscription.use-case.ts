import { Result, ok, err, switchGuard } from "ontologic";

import {
  SubscriptionState,
  InvalidStatusTransition,
} from "../entities/subscription/subscription.entity";
import { SubscriptionRepository } from "../subscription.repository";
import { EntityNotFound } from "./errors/entityNotFound.error";

/**
 * A use case is a plain exported async function. There is no `UseCase` base
 * class. It takes two arguments: the caller's INPUT, then a named DEPENDENCIES
 * bag. The bag scales to use cases that need several repositories — see
 * `subscribeToPlan.use-case.ts`.
 *
 * The governing rule: TECHNICAL failures are thrown, DOMAIN failures are
 * returned in a `Result`.
 *
 * Note that `activatedAt` is part of the input rather than read from the clock
 * inside the entity — see references/where-logic-goes.md.
 */
export async function activateSubscriptionUseCase(
  input: { id: string; activatedAt: string },
  dependencies: { subscriptions: SubscriptionRepository },
): Promise<Result<SubscriptionState, InvalidStatusTransition | EntityNotFound>> {
  const { id, activatedAt } = input;
  const { subscriptions } = dependencies;

  const resultGetById = await subscriptions.getById(id);

  if (resultGetById.isErr()) {
    // Infrastructure is broken. Not a business outcome — throw.
    throw resultGetById.error;
  }

  const subscription = resultGetById.value;

  if (subscription === undefined) {
    // `getById` returns ok(undefined) when absent. Whether "missing" is an
    // error is a DOMAIN decision, so it is returned, not thrown.
    return err(
      new EntityNotFound("This subscription does not exist", { entityId: id }),
    );
  }

  const result = subscription.activate({ activatedAt });

  if (result.isErr()) {
    switch (result.error.name) {
      case "INVALID_STATUS_TRANSITION":
        return err(result.error);

      default:
        // Compile error if a new error name is added and not handled above.
        switchGuard(result.error.name);
    }
  }

  const saveResult = await subscriptions.saveWithEvents(subscription, result.value);

  if (saveResult.isErr()) {
    throw saveResult.error;
  }

  // Return the state, never the entity itself.
  return ok(subscription.readState());
}
