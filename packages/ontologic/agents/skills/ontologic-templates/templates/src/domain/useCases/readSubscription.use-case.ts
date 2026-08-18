import { Result, UseCase, ok, err } from "ontologic";

import { SubscriptionState } from "../entities/subscription/subscription.entity";
import { SubscriptionRepository } from "../subscription.repository";
import { ReadSubscriptionQuery } from "./queries/readSubscription.query";
import { EntityNotFound } from "./errors/entityNotFound.error";

/**
 * A READ use case. The only structural difference from a command use case is the
 * action it is declared over — and that difference is what tells a reader, and
 * any tool inspecting the types, that this one writes nothing.
 */
export class ReadSubscriptionUseCase implements UseCase<
  ReadSubscriptionQuery,
  SubscriptionState,
  EntityNotFound
> {
  constructor(private readonly subscriptions: SubscriptionRepository) {}

  async execute(
    query: ReadSubscriptionQuery,
  ): Promise<Result<SubscriptionState, EntityNotFound>> {
    const { id } = query.payload;

    const resultGetById = await this.subscriptions.getById(id);

    if (resultGetById.isErr()) {
      throw resultGetById.error;
    }

    const subscription = resultGetById.value;

    if (subscription === undefined) {
      return err(
        new EntityNotFound("This subscription does not exist", {
          entityId: id,
        }),
      );
    }

    return ok(subscription.readState());
  }
}
