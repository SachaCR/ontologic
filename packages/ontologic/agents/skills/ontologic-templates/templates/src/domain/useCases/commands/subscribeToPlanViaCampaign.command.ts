import { Command } from "ontologic";

export interface SubscribeToPlanViaCampaignPayload {
  customerId: string;
  planId: string;
  campaignId: string;
}

export class SubscribeToPlanViaCampaignCommand extends Command<
  "SUBSCRIBE_TO_PLAN_VIA_CAMPAIGN",
  SubscribeToPlanViaCampaignPayload
> {
  constructor(payload: SubscribeToPlanViaCampaignPayload) {
    super({ name: "SUBSCRIBE_TO_PLAN_VIA_CAMPAIGN", payload });
  }
}
