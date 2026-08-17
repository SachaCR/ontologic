import { SubscriptionCreated } from "./subscriptionCreated.event";
import { SubscriptionActivated } from "./subscriptionActivated.event";

/**
 * The union of every event this aggregate can emit.
 *
 * Add each new event class here as well as in its own file — this union is the
 * second type parameter of `Repository` / `InMemoryRepository`, and it is what
 * lets `listener.listenTo("SUBSCRIPTION_ACTIVATED", ...)` narrow the handler
 * payload to the right type.
 */
export type SubscriptionEvent = SubscriptionCreated | SubscriptionActivated;
