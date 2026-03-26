import { DomainEvent } from "../../../../../../src";

export interface OrderItemRemovedPayload {
  itemId: string;
}

export class OrderItemRemoved extends DomainEvent<
  "ORDER_ITEM_REMOVED",
  1,
  OrderItemRemovedPayload
> {
  constructor(entityId: string, payload: OrderItemRemovedPayload) {
    super({ name: "ORDER_ITEM_REMOVED", version: 1, entityId, payload });
  }
}
