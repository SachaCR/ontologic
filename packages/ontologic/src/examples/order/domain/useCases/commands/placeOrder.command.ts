import { Command } from "../../../../..";

export class PlaceOrderCommand extends Command<"PLACE_ORDER", { id: string }> {
  constructor(payload: { id: string }) {
    super({ name: "PLACE_ORDER", payload });
  }
}
