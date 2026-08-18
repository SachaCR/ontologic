import { Result, UseCase, ok, err, switchGuard } from "ontologic";

import {
  SubscriptionState,
  InvalidStatusTransition,
} from "../entities/subscription/subscription.entity";
import { SubscriptionRepository } from "../subscription.repository";
import { ActivateSubscriptionCommand } from "./commands/activateSubscription.command";
import { EntityNotFound } from "./errors/entityNotFound.error";

/**
 * A use case is a class implementing `UseCase<Action, Output, Errors>`.
 *
 * The three type arguments are the whole contract: WHAT it is asked to do (a
 * `Command` or a `Query`), WHAT it produces, and WHICH domain failures a caller
 * must handle. Dependencies are constructor parameters — that is what scales to
 * use cases needing several repositories, see `subscribeToPlan.use-case.ts`.
 *
 * The `Errors` argument cannot be widened to `Error`: `DomainError` declares a
 * `context` property that `Error` does not have, so `Result<T, Error>` will not
 * compile. Declare the real union, or `never` if the use case cannot fail.
 *
 * The governing rule: TECHNICAL failures are thrown, DOMAIN failures are
 * returned in a `Result`.
 *
 * Note that `activatedAt` is part of the command rather than read from the clock
 * inside the entity — see references/where-logic-goes.md.
 */
export class ActivateSubscriptionUseCase implements UseCase<
  ActivateSubscriptionCommand,
  SubscriptionState,
  InvalidStatusTransition | EntityNotFound
> {
  constructor(private readonly subscriptions: SubscriptionRepository) {}

  async execute(
    command: ActivateSubscriptionCommand,
  ): Promise<
    Result<SubscriptionState, InvalidStatusTransition | EntityNotFound>
  > {
    const { id, activatedAt } = command.payload;

    const resultGetById = await this.subscriptions.getById(id);

    if (resultGetById.isErr()) {
      // Infrastructure is broken. Not a business outcome — throw.
      throw resultGetById.error;
    }

    const subscription = resultGetById.value;

    if (subscription === undefined) {
      // `getById` returns ok(undefined) when absent. Whether "missing" is an
      // error is a DOMAIN decision, so it is returned, not thrown.
      return err(
        new EntityNotFound("This subscription does not exist", {
          entityId: id,
        }),
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

    const saveResult = await this.subscriptions.saveWithEvents(
      subscription,
      result.value,
    );

    if (saveResult.isErr()) {
      throw saveResult.error;
    }

    // Return the state, never the entity itself.
    return ok(subscription.readState());
  }
}
