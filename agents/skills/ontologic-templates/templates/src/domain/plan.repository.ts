import { InMemoryRepository } from "ontologic";

import { Plan } from "./entities/plan/plan.entity";
import { PlanEvent } from "./entities/plan/events/planEvents";

export class PlanRepository extends InMemoryRepository<Plan, PlanEvent> {
  constructor() {
    super(Plan.fromState);
  }
}
