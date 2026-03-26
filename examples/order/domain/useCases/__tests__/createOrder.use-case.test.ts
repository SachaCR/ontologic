import { describe, it, expect, beforeEach } from "vitest";

import { OrderRepository } from "../../../order.repository";
import { createOrderUseCase } from "../createOrder.use-case";
import { OrderItem } from "../../entities/order/order.entity";

const firstItem: OrderItem = { id: "item-1", name: "Widget", price: 9.99, quantity: 1 };

describe("createOrderUseCase", () => {
  let repository: OrderRepository;

  beforeEach(() => {
    repository = new OrderRepository();
  });

  it("returns the created order state", async () => {
    const state = await createOrderUseCase(repository, {
      customerId: "customer-1",
      firstItem,
    });

    expect(state.customerId).toBe("customer-1");
    expect(state.status).toBe("DRAFT");
    expect(state.items).toHaveLength(1);
    expect(state.items[0]).toEqual(firstItem);
    expect(state.id).toBeDefined();
  });

  it("persists the order in the repository", async () => {
    const state = await createOrderUseCase(repository, {
      customerId: "customer-1",
      firstItem,
    });

    const result = await repository.getById(state.id);
    const persisted = result._unsafeUnwrap();

    expect(persisted).toBeDefined();
    expect(persisted?.readState()).toEqual(state);
  });

  it("stores an ORDER_CREATED event", async () => {
    const state = await createOrderUseCase(repository, {
      customerId: "customer-1",
      firstItem,
    });

    const eventsResult = await repository.getEvents(state.id);
    const events = eventsResult._unsafeUnwrap();

    expect(events).toHaveLength(1);
    const event = events[0]
    if(!event) {
      throw new Error('oups')
    }

    expect(event.name).toBe("ORDER_CREATED");
    expect(event.entityId).toBe(state.id);
    expect(event.payload).toMatchObject({
      customerId: "customer-1",
      status: "DRAFT",
      items: [firstItem],
    });
  });
});
