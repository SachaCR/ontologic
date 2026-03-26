import { OrderRepository } from "../../order.repository";
import { Order, OrderItem, OrderState } from "../entities/order/order.entity";

export async function createOrderUseCase(
  repository: OrderRepository,
  params: {
    customerId: string;
    firstItem: OrderItem;
  },
): Promise<OrderState> {
  const { order, creationEvent } = Order.create(params);

  const result = await repository.saveWithEvents(order, creationEvent);

  if (result.isErr()) {
    throw result.error;
  }

  return order.readState();
}
