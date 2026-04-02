import { DomainEvent } from "../../../../../..";

export interface OrderPlacedPayload {
  status: "PLACED";
}

export class OrderPlaced extends DomainEvent<
  "ORDER_PLACED",
  1,
  OrderPlacedPayload
> {
  constructor(entityId: string, payload: OrderPlacedPayload) {
    super({ name: "ORDER_PLACED", version: 1, entityId, payload });
  }
}
