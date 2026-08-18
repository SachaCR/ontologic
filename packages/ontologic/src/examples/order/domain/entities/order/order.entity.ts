import { randomUUID } from "crypto";

import { Result, err, ok, DomainEntity } from "../../../../..";

import { OrderMustHaveAtLeastOneItem } from "./errors/orderMustHaveAtLeastOneItem.error";
import { VoucherAlreadyApplied } from "./errors/voucherAlreadyApplied.error";
import { InvalidStatusTransition } from "./errors/invalidStatusTransition.error";

import { OrderCreated } from "./events/orderCreated.event";
import { OrderItemAdded } from "./events/orderItemAdded.event";
import { OrderItemRemoved } from "./events/orderItemRemoved.event";
import { VoucherApplied } from "./events/voucherApplied.event";
import { OrderPlaced } from "./events/orderPlaced.event";
import { OrderPaid } from "./events/orderPaid.event";
import { orderHasAtLeastOneItemInvariant } from "./invariants/orderHasAtLeastOneItem";
import { paidOrderHasInvoiceIdInvariant } from "./invariants/paidOrderHasInvoiceId";

export { OrderMustHaveAtLeastOneItem } from "./errors/orderMustHaveAtLeastOneItem.error";
export { VoucherAlreadyApplied } from "./errors/voucherAlreadyApplied.error";
export { InvalidStatusTransition } from "./errors/invalidStatusTransition.error";

export type OrderStatus = "DRAFT" | "PLACED" | "PAID";

export interface OrderItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
}

export interface OrderState {
  id: string;
  customerId: string;
  status: OrderStatus;
  items: OrderItem[];
  voucherId?: string;
  invoiceId?: string;
}

export class Order extends DomainEntity<OrderState> {
  private constructor(id: string, state: OrderState) {
    super(id, state);

    this.addInvariant(orderHasAtLeastOneItemInvariant);
    this.addInvariant(paidOrderHasInvoiceIdInvariant);
  }

  static fromState(id: string, state: OrderState) {
    return new Order(id, state);
  }

  static create(params: { customerId: string; firstItem: OrderItem }): {
    order: Order;
    creationEvent: OrderCreated;
  } {
    const id = randomUUID();

    const creationEvent = new OrderCreated(id, {
      customerId: params.customerId,
      status: "DRAFT",
      items: [params.firstItem],
    });

    const initialState: OrderState = {
      id,
      ...creationEvent.payload,
    };

    const order = new Order(id, initialState);

    return { order, creationEvent };
  }

  addItem(params: {
    item: OrderItem;
  }): Result<OrderItemAdded, InvalidStatusTransition> {
    if (this.state.status !== "DRAFT") {
      return err(
        new InvalidStatusTransition(
          `Cannot add items to an order that is not in DRAFT status`,
          { currentStatus: this.state.status, expectedStatus: "DRAFT" },
        ),
      );
    }

    this.state.items.push(params.item);

    return ok(new OrderItemAdded(this.id(), { item: params.item }));
  }

  removeItem(params: {
    itemId: string;
  }): Result<
    OrderItemRemoved,
    OrderMustHaveAtLeastOneItem | InvalidStatusTransition
  > {
    if (this.state.status !== "DRAFT") {
      return err(
        new InvalidStatusTransition(
          `Cannot remove items from an order that is not in DRAFT status`,
          { currentStatus: this.state.status, expectedStatus: "DRAFT" },
        ),
      );
    }

    if (this.state.items.length <= 1) {
      return err(
        new OrderMustHaveAtLeastOneItem(
          `Cannot remove the last item from an order`,
        ),
      );
    }

    this.state.items = this.state.items.filter(
      (item) => item.id !== params.itemId,
    );

    return ok(new OrderItemRemoved(this.id(), { itemId: params.itemId }));
  }

  applyVoucher(params: {
    voucherId: string;
  }): Result<VoucherApplied, VoucherAlreadyApplied | InvalidStatusTransition> {
    if (this.state.status !== "DRAFT") {
      return err(
        new InvalidStatusTransition(
          `Cannot apply a voucher to an order that is not in DRAFT status`,
          { currentStatus: this.state.status, expectedStatus: "DRAFT" },
        ),
      );
    }

    if (this.state.voucherId !== undefined) {
      return err(
        new VoucherAlreadyApplied(
          `An order can only have one voucher applied`,
          { existingVoucherId: this.state.voucherId },
        ),
      );
    }

    this.state.voucherId = params.voucherId;

    return ok(new VoucherApplied(this.id(), { voucherId: params.voucherId }));
  }

  place(): Result<OrderPlaced, InvalidStatusTransition> {
    if (this.state.status !== "DRAFT") {
      return err(
        new InvalidStatusTransition(
          `Cannot place an order that is not in DRAFT status`,
          { currentStatus: this.state.status, expectedStatus: "DRAFT" },
        ),
      );
    }

    this.state.status = "PLACED";

    return ok(new OrderPlaced(this.id(), { status: "PLACED" }));
  }

  pay(params: {
    invoiceId: string;
  }): Result<OrderPaid, InvalidStatusTransition> {
    if (this.state.status !== "PLACED") {
      return err(
        new InvalidStatusTransition(
          `Cannot pay an order that is not in PLACED status`,
          { currentStatus: this.state.status, expectedStatus: "PLACED" },
        ),
      );
    }

    this.state.status = "PAID";
    this.state.invoiceId = params.invoiceId;

    return ok(
      new OrderPaid(this.id(), { status: "PAID", invoiceId: params.invoiceId }),
    );
  }
}
