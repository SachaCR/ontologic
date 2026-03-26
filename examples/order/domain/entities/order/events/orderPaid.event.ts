import { DomainEvent } from "../../../../../../src";

export interface OrderPaidPayload {
  status: "PAID";
  invoiceId: string;
}

export class OrderPaid extends DomainEvent<
  "ORDER_PAID",
  1,
  OrderPaidPayload
> {
  constructor(entityId: string, payload: OrderPaidPayload) {
    super({ name: "ORDER_PAID", version: 1, entityId, payload });
  }
}
