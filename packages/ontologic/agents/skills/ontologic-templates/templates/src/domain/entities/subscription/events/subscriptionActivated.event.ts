import { DomainEvent } from "ontologic";

export interface SubscriptionActivatedPayload {
  status: "ACTIVE";
  activatedAt: string;
}

export class SubscriptionActivated extends DomainEvent<
  "SUBSCRIPTION_ACTIVATED",
  1,
  SubscriptionActivatedPayload
> {
  constructor(entityId: string, payload: SubscriptionActivatedPayload) {
    super({ name: "SUBSCRIPTION_ACTIVATED", version: 1, entityId, payload });
  }
}
