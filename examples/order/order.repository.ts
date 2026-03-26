import { InMemoryRepository } from "../../src";

import { Order } from "./domain/entities/order/order.entity";

export class OrderRepository extends InMemoryRepository<Order> {
  constructor() {
    super(Order.fromState);
  }
}
