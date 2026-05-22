import { switchGuard, ok, err, Result } from "../../../..";

import {
  OrderState,
  InvalidStatusTransition,
} from "../entities/order/order.entity";
import { OrderRepository } from "../../order.repository";
import { EntityNotFound } from "./errors/entityNotFound.error";

export async function payOrderUseCase(
  repository: OrderRepository,
  id: string,
  invoiceId: string,
): Promise<Result<OrderState, InvalidStatusTransition | EntityNotFound>> {
  const resultGetById = await repository.getById(id);

  if (resultGetById.isErr()) {
    throw resultGetById.error;
  }

  const order = resultGetById.value;

  if (order === undefined) {
    return err(
      new EntityNotFound("This order does not exist", { entityId: id }),
    );
  }

  const result = order.pay({ invoiceId });

  if (result.isErr()) {
    switch (result.error.name) {
      case "INVALID_STATUS_TRANSITION":
        return err(result.error);

      default:
        switchGuard(result.error.name);
    }
  }

  const paidEvent = result.value;

  const saveResult = await repository.saveWithEvents(order, paidEvent);

  if (saveResult.isErr()) {
    throw saveResult.error;
  }

  return ok(order.readState());
}
