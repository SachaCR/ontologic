import { describe, it, expect, beforeEach } from "vitest";

import { OrderRepository } from "../../../order.repository";
import { CreateOrderUseCase } from "../createOrder.use-case";
import { PlaceOrderUseCase } from "../placeOrder.use-case";
import { CreateOrderCommand } from "../commands/createOrder.command";
import { PlaceOrderCommand } from "../commands/placeOrder.command";
import { OrderItem } from "../../entities/order/order.entity";

const firstItem: OrderItem = {
  id: "item-1",
  name: "Widget",
  price: 9.99,
  quantity: 1,
};

describe("PlaceOrderUseCase", () => {
  let repository: OrderRepository;
  let createOrder: CreateOrderUseCase;
  let placeOrder: PlaceOrderUseCase;

  beforeEach(() => {
    repository = new OrderRepository();
    createOrder = new CreateOrderUseCase(repository);
    placeOrder = new PlaceOrderUseCase(repository);
  });

  const setupDraftOrder = async (): Promise<string> => {
    const created = await createOrder.execute(
      new CreateOrderCommand({ customerId: "customer-1", firstItem }),
    );

    return created._unsafeUnwrap().id;
  };

  it("returns the order state with PLACED status", async () => {
    const orderId = await setupDraftOrder();

    const result = await placeOrder.execute(
      new PlaceOrderCommand({ id: orderId }),
    );

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().status).toBe("PLACED");
  });

  it("persists the order with PLACED status in the repository", async () => {
    const orderId = await setupDraftOrder();

    await placeOrder.execute(new PlaceOrderCommand({ id: orderId }));

    const persisted = (await repository.getById(orderId))._unsafeUnwrap();
    expect(persisted?.readState().status).toBe("PLACED");
  });

  it("stores an ORDER_PLACED event", async () => {
    const orderId = await setupDraftOrder();

    await placeOrder.execute(new PlaceOrderCommand({ id: orderId }));

    const events = (await repository.getEvents(orderId))._unsafeUnwrap();
    const placedEvent = events.find((e) => e.event.name === "ORDER_PLACED");

    expect(placedEvent).toBeDefined();
    expect(placedEvent?.event.entityId).toBe(orderId);
    expect(placedEvent?.event.payload).toMatchObject({ status: "PLACED" });
  });

  it("accumulates events: ORDER_CREATED then ORDER_PLACED", async () => {
    const orderId = await setupDraftOrder();

    await placeOrder.execute(new PlaceOrderCommand({ id: orderId }));

    const events = (await repository.getEvents(orderId))._unsafeUnwrap();
    expect(events).toHaveLength(2);
    expect(events[0]?.event.name).toBe("ORDER_CREATED");
    expect(events[1]?.event.name).toBe("ORDER_PLACED");
  });

  it("returns ENTITY_NOT_FOUND when the order does not exist", async () => {
    const result = await placeOrder.execute(
      new PlaceOrderCommand({ id: "unknown-id" }),
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.name).toBe("ENTITY_NOT_FOUND");
    }
  });

  it("returns INVALID_STATUS_TRANSITION when the order is already PLACED", async () => {
    const orderId = await setupDraftOrder();
    await placeOrder.execute(new PlaceOrderCommand({ id: orderId }));

    const result = await placeOrder.execute(
      new PlaceOrderCommand({ id: orderId }),
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.name).toBe("INVALID_STATUS_TRANSITION");
    }
  });
});
