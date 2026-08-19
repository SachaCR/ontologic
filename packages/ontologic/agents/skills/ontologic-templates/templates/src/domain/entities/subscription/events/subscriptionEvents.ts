import { SubscriptionCreated } from "./subscriptionCreated.event";
import { SubscriptionActivated } from "./subscriptionActivated.event";
import { CampaignConversionRecorded } from "./campaignConversionRecorded.event";

/**
 * The union of every event this aggregate can emit.
 *
 * Add each new event class here as well as in its own file — this union is the
 * second type parameter of `Repository` / `InMemoryRepository`, and it is what
 * lets `listener.listenTo("SUBSCRIPTION_ACTIVATED", ...)` narrow the handler
 * payload to the right type.
 *
 * `CampaignConversionRecorded` is in here even though the aggregate never emits
 * it — a use case does. It is persisted against the subscription's id, so it
 * reaches the same listeners, and leaving it out would type them for an event
 * they will actually receive.
 */
export type SubscriptionEvent =
  SubscriptionCreated | SubscriptionActivated | CampaignConversionRecorded;
