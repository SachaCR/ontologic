import { Result, UseCase, err, ok, switchGuard } from "../../../..";

import { OrderRepository } from "../../order.repository";
import {
  InvalidStatusTransition,
  OrderState,
} from "../entities/order/order.entity";
import { PlaceOrderCommand } from "./commands/placeOrder.command";
import { EntityNotFound } from "./errors/entityNotFound.error";

export class PlaceOrderUseCase implements UseCase<
  PlaceOrderCommand,
  OrderState,
  InvalidStatusTransition | EntityNotFound
> {
  constructor(private readonly orders: OrderRepository) {}

  async execute(
    command: PlaceOrderCommand,
  ): Promise<Result<OrderState, InvalidStatusTransition | EntityNotFound>> {
    const { id } = command.payload;

    const resultGetById = await this.orders.getById(id);

    if (resultGetById.isErr()) {
      throw resultGetById.error;
    }

    const order = resultGetById.value;

    if (order === undefined) {
      return err(
        new EntityNotFound("This order does not exist", { entityId: id }),
      );
    }

    const result = order.place();

    if (result.isErr()) {
      switch (result.error.name) {
        case "INVALID_STATUS_TRANSITION":
          return err(result.error);

        default:
          switchGuard(result.error.name);
      }
    }

    const placedEvent = result.value;

    const saveResult = await this.orders.saveWithEvents(order, placedEvent);

    if (saveResult.isErr()) {
      throw saveResult.error;
    }

    return ok(order.readState());
  }
}
