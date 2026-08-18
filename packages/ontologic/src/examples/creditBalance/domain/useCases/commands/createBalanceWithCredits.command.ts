import { Command } from "../../../../..";

export interface CreateBalanceWithCreditsPayload {
  organizationId: string;
  amount: number;
}

export class CreateBalanceWithCreditsCommand extends Command<
  "CREATE_BALANCE_WITH_CREDITS",
  CreateBalanceWithCreditsPayload
> {
  constructor(payload: CreateBalanceWithCreditsPayload) {
    super({ name: "CREATE_BALANCE_WITH_CREDITS", payload });
  }
}
