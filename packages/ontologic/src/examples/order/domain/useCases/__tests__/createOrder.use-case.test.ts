import { describe, it, expect, beforeEach } from "vitest";

import { OrderRepository } from "../../../order.repository";
import { CreateOrderUseCase } from "../createOrder.use-case";
import { CreateOrderCommand } from "../commands/createOrder.command";
import { OrderItem } from "../../entities/order/order.entity";

const firstItem: OrderItem = {
  id: "item-1",
  name: "Widget",
  price: 9.99,
  quantity: 1,
};

describe("CreateOrderUseCase", () => {
  let repository: OrderRepository;
  let createOrder: CreateOrderUseCase;

  beforeEach(() => {
    repository = new OrderRepository();
    createOrder = new CreateOrderUseCase(repository);
  });

  it("returns the created order state", async () => {
    const result = await createOrder.execute(
      new CreateOrderCommand({ customerId: "customer-1", firstItem }),
    );

    const state = result._unsafeUnwrap();
    expect(state.customerId).toBe("customer-1");
    expect(state.status).toBe("DRAFT");
    expect(state.items).toHaveLength(1);
    expect(state.items[0]).toEqual(firstItem);
    expect(state.id).toBeDefined();
  });

  it("persists the order in the repository", async () => {
    const state = (
      await createOrder.execute(
        new CreateOrderCommand({ customerId: "customer-1", firstItem }),
      )
    )._unsafeUnwrap();

    const result = await repository.getById(state.id);
    const persisted = result._unsafeUnwrap();

    expect(persisted).toBeDefined();
    expect(persisted?.readState()).toEqual(state);
  });

  it("stores an ORDER_CREATED event", async () => {
    const state = (
      await createOrder.execute(
        new CreateOrderCommand({ customerId: "customer-1", firstItem }),
      )
    )._unsafeUnwrap();

    const eventsResult = await repository.getEvents(state.id);
    const events = eventsResult._unsafeUnwrap();

    expect(events).toHaveLength(1);
    const event = events[0];
    if (!event) {
      throw new Error("oups");
    }

    expect(event.event.name).toBe("ORDER_CREATED");
    expect(event.event.entityId).toBe(state.id);
    expect(event.event.payload).toMatchObject({
      customerId: "customer-1",
      status: "DRAFT",
      items: [firstItem],
    });
  });
});
