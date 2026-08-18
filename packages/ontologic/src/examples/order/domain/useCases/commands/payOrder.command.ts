import { Command } from "../../../../..";

export interface PayOrderPayload {
  id: string;
  invoiceId: string;
}

export class PayOrderCommand extends Command<"PAY_ORDER", PayOrderPayload> {
  constructor(payload: PayOrderPayload) {
    super({ name: "PAY_ORDER", payload });
  }
}
