import { Result, UseCase, ok, err } from "ontologic";

import {
  Subscription,
  SubscriptionState,
} from "../entities/subscription/subscription.entity";
import { CampaignConversionRecorded } from "../entities/subscription/events/campaignConversionRecorded.event";
import { SubscriptionEvent } from "../entities/subscription/events/subscriptionEvents";
import { PlanNoLongerOffered } from "../entities/plan/errors/planNoLongerOffered.error";
import { SubscriptionRepository } from "../subscription.repository";
import { PlanRepository } from "../plan.repository";
import { SubscribeToPlanViaCampaignCommand } from "./commands/subscribeToPlanViaCampaign.command";
import { EntityNotFound } from "./errors/entityNotFound.error";

/**
 * A use case that BUILDS ONE OF ITS OWN EVENTS — the shape to copy when a fact
 * worth recording exists only in the use case's context.
 *
 * The default is the opposite: an event derivable from the aggregate's own
 * state belongs on the aggregate, which returns it inside a `Result`. That is
 * what `subscribeToPlan.use-case.ts` does, and it is the shape to reach for
 * first.
 *
 * Here the customer arrived through a marketing campaign. `Subscription` knows
 * it was created and emits `SUBSCRIPTION_CREATED` for it — but a campaign is
 * not something the aggregate should know about, and teaching it would mean
 * teaching it a concept from another part of the business entirely. So the use
 * case records the conversion itself.
 *
 * The test to apply: could the aggregate decide this from its own state? If
 * yes, put it on the aggregate. If modelling it there means the aggregate has
 * to learn a context it has no business holding, build the event here.
 *
 * You could also add `subscription.recordCampaignConversion(campaignId)` and
 * let the entity emit it. Sometimes that is the better model — Ontologic does
 * not decide it for you. Nobody knows your domain and its constraints better
 * than you do.
 *
 * Note what is NOT happening: the use case's event is added to the aggregate's
 * own events, never substituted for them. Both land in one `saveWithEvents`.
 */
export class SubscribeToPlanViaCampaignUseCase implements UseCase<
  SubscribeToPlanViaCampaignCommand,
  SubscriptionState,
  EntityNotFound | PlanNoLongerOffered
> {
  constructor(
    private readonly subscriptions: SubscriptionRepository,
    private readonly plans: PlanRepository,
  ) {}

  async execute(
    command: SubscribeToPlanViaCampaignCommand,
  ): Promise<Result<SubscriptionState, EntityNotFound | PlanNoLongerOffered>> {
    const { customerId, planId, campaignId } = command.payload;

    const planLookup = await this.plans.getById(planId);

    if (planLookup.isErr()) {
      throw planLookup.error;
    }

    const plan = planLookup.value;

    if (plan === undefined) {
      return err(
        new EntityNotFound("This plan does not exist", { entityId: planId }),
      );
    }

    if (!plan.readState().offered) {
      return err(
        new PlanNoLongerOffered("This plan is no longer offered", { planId }),
      );
    }

    const domainEvents: SubscriptionEvent[] = [];

    // What the aggregate can know from its own state.
    const { subscription, creationEvent } = Subscription.create({
      customerId,
      planId,
    });

    domainEvents.push(creationEvent);

    // What only this use case knows: the subscription came from a campaign.
    domainEvents.push(
      new CampaignConversionRecorded(subscription.id(), {
        campaignId,
        customerId,
        planId,
      }),
    );

    // One atomic write. The state change and both facts land together.
    const saveResult = await this.subscriptions.saveWithEvents(
      subscription,
      domainEvents,
    );

    if (saveResult.isErr()) {
      throw saveResult.error;
    }

    return ok(subscription.readState());
  }
}
