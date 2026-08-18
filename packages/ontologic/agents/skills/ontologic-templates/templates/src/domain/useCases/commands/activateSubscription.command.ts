import { Command } from "ontologic";

/**
 * A COMMAND: an intent to change something, which the domain may refuse.
 *
 * The literal name is bound once, here, so callers never repeat it. Extend
 * `Query` instead when the action only reads — see
 * `queries/readSubscription.query.ts`.
 */
export interface ActivateSubscriptionPayload {
  id: string;
  activatedAt: string;
}

export class ActivateSubscriptionCommand extends Command<
  "ACTIVATE_SUBSCRIPTION",
  ActivateSubscriptionPayload
> {
  constructor(payload: ActivateSubscriptionPayload) {
    super({ name: "ACTIVATE_SUBSCRIPTION", payload });
  }
}
