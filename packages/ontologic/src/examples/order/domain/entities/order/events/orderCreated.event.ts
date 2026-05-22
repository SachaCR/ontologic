import { DomainEvent } from "../../../../../..";

export interface OrderCreatedPayload {
  customerId: string;
  status: "DRAFT";
  items: Array<{ id: string; name: string; price: number; quantity: number }>;
  voucherId?: string;
}

export class OrderCreated extends DomainEvent<
  "ORDER_CREATED",
  1,
  OrderCreatedPayload
> {
  constructor(entityId: string, payload: OrderCreatedPayload) {
    super({ name: "ORDER_CREATED", version: 1, entityId, payload });
  }
}
