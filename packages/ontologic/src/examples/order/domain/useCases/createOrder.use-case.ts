import { Result, UseCase, ok } from "../../../..";

import { OrderRepository } from "../../order.repository";
import { Order, OrderState } from "../entities/order/order.entity";
import { CreateOrderCommand } from "./commands/createOrder.command";

/**
 * Creating an order has no domain failure mode — the entity's invariants are
 * the only thing that can reject it, and those throw. So the error side is
 * `never` rather than a union.
 */
export class CreateOrderUseCase implements UseCase<
  CreateOrderCommand,
  OrderState,
  never
> {
  constructor(private readonly orders: OrderRepository) {}

  async execute(
    command: CreateOrderCommand,
  ): Promise<Result<OrderState, never>> {
    const { order, creationEvent } = Order.create(command.payload);

    const result = await this.orders.saveWithEvents(order, creationEvent);

    if (result.isErr()) {
      throw result.error;
    }

    return ok(order.readState());
  }
}
