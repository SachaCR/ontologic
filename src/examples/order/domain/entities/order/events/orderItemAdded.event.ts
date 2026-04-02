import { DomainEvent } from "../../../../../..";

export interface OrderItemAddedPayload {
  item: { id: string; name: string; price: number; quantity: number };
}

export class OrderItemAdded extends DomainEvent<
  "ORDER_ITEM_ADDED",
  1,
  OrderItemAddedPayload
> {
  constructor(entityId: string, payload: OrderItemAddedPayload) {
    super({ name: "ORDER_ITEM_ADDED", version: 1, entityId, payload });
  }
}
