import { Command } from "../../../../..";

import { OrderItem } from "../../entities/order/order.entity";

export interface AddItemToOrderPayload {
  id: string;
  item: OrderItem;
}

export class AddItemToOrderCommand extends Command<
  "ADD_ITEM_TO_ORDER",
  AddItemToOrderPayload
> {
  constructor(payload: AddItemToOrderPayload) {
    super({ name: "ADD_ITEM_TO_ORDER", payload });
  }
}
