import { Command } from "../../../../..";

export interface DebitBalancePayload {
  id: string;
  amount: number;
}

export class DebitBalanceCommand extends Command<
  "DEBIT_BALANCE",
  DebitBalancePayload
> {
  constructor(payload: DebitBalancePayload) {
    super({ name: "DEBIT_BALANCE", payload });
  }
}
