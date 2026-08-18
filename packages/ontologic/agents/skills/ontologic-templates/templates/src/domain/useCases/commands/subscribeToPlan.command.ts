import { Command } from "ontologic";

export interface SubscribeToPlanPayload {
  customerId: string;
  planId: string;
}

export class SubscribeToPlanCommand extends Command<
  "SUBSCRIBE_TO_PLAN",
  SubscribeToPlanPayload
> {
  constructor(payload: SubscribeToPlanPayload) {
    super({ name: "SUBSCRIBE_TO_PLAN", payload });
  }
}
