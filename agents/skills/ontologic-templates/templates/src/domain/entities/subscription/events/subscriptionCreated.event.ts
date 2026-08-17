import { DomainEvent } from "ontologic";

export interface SubscriptionCreatedPayload {
  customerId: string;
  planId: string;
  status: "PENDING";
}

export class SubscriptionCreated extends DomainEvent<
  "SUBSCRIPTION_CREATED",
  1,
  SubscriptionCreatedPayload
> {
  constructor(entityId: string, payload: SubscriptionCreatedPayload) {
    super({ name: "SUBSCRIPTION_CREATED", version: 1, entityId, payload });
  }
}
