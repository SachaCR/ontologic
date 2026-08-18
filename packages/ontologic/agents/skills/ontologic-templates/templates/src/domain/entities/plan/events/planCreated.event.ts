import { DomainEvent } from "ontologic";

export interface PlanCreatedPayload {
  name: string;
  monthlyPriceCents: number;
  offered: boolean;
}

export class PlanCreated extends DomainEvent<"PLAN_CREATED", 1, PlanCreatedPayload> {
  constructor(entityId: string, payload: PlanCreatedPayload) {
    super({ name: "PLAN_CREATED", version: 1, entityId, payload });
  }
}
