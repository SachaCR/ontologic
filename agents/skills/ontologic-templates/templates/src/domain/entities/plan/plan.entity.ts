import { randomUUID } from "node:crypto";

import { DomainEntity } from "ontologic";

import { PlanCreated } from "./events/planCreated.event";

export interface PlanState {
  id: string;
  name: string;
  monthlyPriceCents: number;
  /** Whether the plan is still open to new subscribers. */
  offered: boolean;
}

/**
 * A second aggregate, deliberately minimal.
 *
 * It exists to show what a use case does when a rule spans two aggregates: the
 * Plan is loaded as a read-only fact source, and is never mutated or saved by
 * the subscription use case. See `subscribeToPlan.use-case.ts`.
 *
 * Note what is NOT here: `Plan` has no method answering "may this plan be
 * subscribed to?", because that question belongs to the subscription flow, not
 * to the plan. A plan only knows whether it is still offered.
 */
export class Plan extends DomainEntity<PlanState> {
  private constructor(id: string, state: PlanState) {
    super(id, state);
  }

  static fromState(id: string, state: PlanState): Plan {
    return new Plan(id, state);
  }

  static create(params: { name: string; monthlyPriceCents: number }): {
    plan: Plan;
    creationEvent: PlanCreated;
  } {
    const id = randomUUID();

    const creationEvent = new PlanCreated(id, {
      name: params.name,
      monthlyPriceCents: params.monthlyPriceCents,
      offered: true,
    });

    return {
      plan: new Plan(id, { id, ...creationEvent.payload }),
      creationEvent,
    };
  }
}
