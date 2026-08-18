import { Command } from "../../../../..";

import { OrderItem } from "../../entities/order/order.entity";

export interface CreateOrderPayload {
  customerId: string;
  firstItem: OrderItem;
}

export class CreateOrderCommand extends Command<
  "CREATE_ORDER",
  CreateOrderPayload
> {
  constructor(payload: CreateOrderPayload) {
    super({ name: "CREATE_ORDER", payload });
  }
}
