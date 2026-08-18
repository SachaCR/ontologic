import { describe, it, expect, beforeEach } from "vitest";

import { OrderRepository } from "../../../order.repository";
import { CreateOrderUseCase } from "../createOrder.use-case";
import { PlaceOrderUseCase } from "../placeOrder.use-case";
import { PayOrderUseCase } from "../payOrder.use-case";
import { CreateOrderCommand } from "../commands/createOrder.command";
import { PlaceOrderCommand } from "../commands/placeOrder.command";
import { PayOrderCommand } from "../commands/payOrder.command";
import { OrderItem } from "../../entities/order/order.entity";

const firstItem: OrderItem = {
  id: "item-1",
  name: "Widget",
  price: 9.99,
  quantity: 1,
};

describe("PayOrderUseCase", () => {
  let repository: OrderRepository;
  let createOrder: CreateOrderUseCase;
  let placeOrder: PlaceOrderUseCase;
  let payOrder: PayOrderUseCase;

  beforeEach(() => {
    repository = new OrderRepository();
    createOrder = new CreateOrderUseCase(repository);
    placeOrder = new PlaceOrderUseCase(repository);
    payOrder = new PayOrderUseCase(repository);
  });

  const setupDraftOrder = async (): Promise<string> => {
    const created = await createOrder.execute(
      new CreateOrderCommand({ customerId: "customer-1", firstItem }),
    );

    return created._unsafeUnwrap().id;
  };

  const setupPlacedOrder = async (): Promise<string> => {
    const orderId = await setupDraftOrder();
    await placeOrder.execute(new PlaceOrderCommand({ id: orderId }));

    return orderId;
  };

  it("returns the order state with PAID status and the invoiceId", async () => {
    const orderId = await setupPlacedOrder();

    const result = await payOrder.execute(
      new PayOrderCommand({ id: orderId, invoiceId: "invoice-123" }),
    );

    expect(result.isOk()).toBe(true);
    const state = result._unsafeUnwrap();
    expect(state.status).toBe("PAID");
    expect(state.invoiceId).toBe("invoice-123");
  });

  it("persists the order with PAID status and invoiceId in the repository", async () => {
    const orderId = await setupPlacedOrder();

    await payOrder.execute(
      new PayOrderCommand({ id: orderId, invoiceId: "invoice-123" }),
    );

    const persisted = (await repository.getById(orderId))._unsafeUnwrap();
    expect(persisted?.readState().status).toBe("PAID");
    expect(persisted?.readState().invoiceId).toBe("invoice-123");
  });

  it("stores an ORDER_PAID event with the invoiceId", async () => {
    const orderId = await setupPlacedOrder();

    await payOrder.execute(
      new PayOrderCommand({ id: orderId, invoiceId: "invoice-123" }),
    );

    const events = (await repository.getEvents(orderId))._unsafeUnwrap();
    const paidEvent = events.find((e) => e.event.name === "ORDER_PAID");

    expect(paidEvent).toBeDefined();
    expect(paidEvent?.event.entityId).toBe(orderId);
    expect(paidEvent?.event.payload).toMatchObject({
      status: "PAID",
      invoiceId: "invoice-123",
    });
  });

  it("accumulates events: ORDER_CREATED, ORDER_PLACED, then ORDER_PAID", async () => {
    const orderId = await setupPlacedOrder();

    await payOrder.execute(
      new PayOrderCommand({ id: orderId, invoiceId: "invoice-123" }),
    );

    const events = (await repository.getEvents(orderId))._unsafeUnwrap();
    expect(events).toHaveLength(3);
    expect(events[0]?.event.name).toBe("ORDER_CREATED");
    expect(events[1]?.event.name).toBe("ORDER_PLACED");
    expect(events[2]?.event.name).toBe("ORDER_PAID");
  });

  it("returns ENTITY_NOT_FOUND when the order does not exist", async () => {
    const result = await payOrder.execute(
      new PayOrderCommand({ id: "unknown-id", invoiceId: "invoice-123" }),
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.name).toBe("ENTITY_NOT_FOUND");
    }
  });

  it("returns INVALID_STATUS_TRANSITION when the order is in DRAFT status", async () => {
    const orderId = await setupDraftOrder();

    const result = await payOrder.execute(
      new PayOrderCommand({ id: orderId, invoiceId: "invoice-123" }),
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.name).toBe("INVALID_STATUS_TRANSITION");
    }
  });

  it("returns INVALID_STATUS_TRANSITION when the order is already PAID", async () => {
    const orderId = await setupPlacedOrder();
    await payOrder.execute(
      new PayOrderCommand({ id: orderId, invoiceId: "invoice-123" }),
    );

    const result = await payOrder.execute(
      new PayOrderCommand({ id: orderId, invoiceId: "invoice-456" }),
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.name).toBe("INVALID_STATUS_TRANSITION");
    }
  });
});
