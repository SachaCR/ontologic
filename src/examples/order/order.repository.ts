import { InMemoryRepository } from "../..";

import { OrderEvent } from "./domain/entities/order/events/orderEvents";
import { Order } from "./domain/entities/order/order.entity";

export class OrderRepository extends InMemoryRepository<Order, OrderEvent> {
  constructor() {
    super(Order.fromState);
  }
}
