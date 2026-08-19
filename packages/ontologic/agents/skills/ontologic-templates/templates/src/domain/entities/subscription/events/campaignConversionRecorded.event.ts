import { DomainEvent } from "ontologic";

export interface CampaignConversionRecordedPayload {
  campaignId: string;
  customerId: string;
  planId: string;
}

/**
 * Produced by the USE CASE, not by the aggregate.
 *
 * A `Subscription` knows it was created; it has no business knowing that a
 * marketing campaign is what brought the customer in. That context exists only
 * in `subscribeToPlanViaCampaign.use-case.ts`, so the event is built there.
 *
 * It still lives in this folder, and in `subscriptionEvents.ts`, because it is
 * persisted against the subscription's id and therefore arrives in the same
 * stream. A listener typed on `SubscriptionEvent` would otherwise receive an
 * event its own type says cannot exist. Keeping the file here also avoids the
 * entity layer importing from the use-case layer.
 */
export class CampaignConversionRecorded extends DomainEvent<
  "CAMPAIGN_CONVERSION_RECORDED",
  1,
  CampaignConversionRecordedPayload
> {
  constructor(entityId: string, payload: CampaignConversionRecordedPayload) {
    super({
      name: "CAMPAIGN_CONVERSION_RECORDED",
      version: 1,
      entityId,
      payload,
    });
  }
}
