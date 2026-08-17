import { Result, ok, err, switchGuard } from "ontologic";

import {
  SubscriptionState,
  InvalidStatusTransition,
} from "../entities/subscription/subscription.entity";
import { SubscriptionRepository } from "../subscription.repository";
import { EntityNotFound } from "./errors/entityNotFound.error";

/**
 * A use case is a plain exported async function taking the repository as its
 * first argument. There is no `UseCase` base class.
 *
 * The governing rule: TECHNICAL failures are thrown, DOMAIN failures are
 * returned in a `Result`.
 */
export async function activateSubscriptionUseCase(
  repository: SubscriptionRepository,
  id: string,
  activatedAt: string,
): Promise<Result<SubscriptionState, InvalidStatusTransition | EntityNotFound>> {
  const resultGetById = await repository.getById(id);

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

  const saveResult = await repository.saveWithEvents(subscription, result.value);

  if (saveResult.isErr()) {
    throw saveResult.error;
  }

  // Return the state, never the entity itself.
  return ok(subscription.readState());
}
