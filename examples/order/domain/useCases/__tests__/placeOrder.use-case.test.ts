import { describe, it, expect, beforeEach } from "vitest";

import { OrderRepository } from "../../../order.repository";
import { createOrderUseCase } from "../createOrder.use-case";
import { placeOrderUseCase } from "../placeOrder.use-case";
import { OrderItem } from "../../entities/order/order.entity";

const firstItem: OrderItem = { id: "item-1", name: "Widget", price: 9.99, quantity: 1 };

describe("placeOrderUseCase", () => {
  let repository: OrderRepository;

  beforeEach(() => {
    repository = new OrderRepository();
  });

  it("returns the order state with PLACED status", async () => {
    const created = await createOrderUseCase(repository, {
      customerId: "customer-1",
      firstItem,
    });

    const result = await placeOrderUseCase(repository, created.id);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().status).toBe("PLACED");
  });

  it("persists the order with PLACED status in the repository", async () => {
    const created = await createOrderUseCase(repository, {
      customerId: "customer-1",
      firstItem,
    });

    await placeOrderUseCase(repository, created.id);

    const persisted = (await repository.getById(created.id))._unsafeUnwrap();
    expect(persisted?.readState().status).toBe("PLACED");
  });

  it("stores an ORDER_PLACED event", async () => {
    const created = await createOrderUseCase(repository, {
      customerId: "customer-1",
      firstItem,
    });

    await placeOrderUseCase(repository, created.id);

    const events = (await repository.getEvents(created.id))._unsafeUnwrap();
    const placedEvent = events.find((e) => e.event.name === "ORDER_PLACED");

    expect(placedEvent).toBeDefined();
    expect(placedEvent?.event.entityId).toBe(created.id);
    expect(placedEvent?.event.payload).toMatchObject({ status: "PLACED" });
  });

  it("accumulates events: ORDER_CREATED then ORDER_PLACED", async () => {
    const created = await createOrderUseCase(repository, {
      customerId: "customer-1",
      firstItem,
    });

    await placeOrderUseCase(repository, created.id);

    const events = (await repository.getEvents(created.id))._unsafeUnwrap();
    expect(events).toHaveLength(2);
    expect(events[0]?.event.name).toBe("ORDER_CREATED");
    expect(events[1]?.event.name).toBe("ORDER_PLACED");
  });

  it("returns ENTITY_NOT_FOUND when the order does not exist", async () => {
    const result = await placeOrderUseCase(repository, "unknown-id");

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.name).toBe("ENTITY_NOT_FOUND");
    }
  });

  it("returns INVALID_STATUS_TRANSITION when the order is already PLACED", async () => {
    const created = await createOrderUseCase(repository, {
      customerId: "customer-1",
      firstItem,
    });

    await placeOrderUseCase(repository, created.id);
    const result = await placeOrderUseCase(repository, created.id);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.name).toBe("INVALID_STATUS_TRANSITION");
    }
  });
});
