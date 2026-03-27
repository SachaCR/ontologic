import { describe, it, expect, beforeEach } from "vitest";

import { OrderRepository } from "../../../order.repository";
import { createOrderUseCase } from "../createOrder.use-case";
import { addItemToOrderUseCase } from "../addItemToOrder.use-case";
import { OrderItem } from "../../entities/order/order.entity";

const firstItem: OrderItem = { id: "item-1", name: "Widget", price: 9.99, quantity: 1 };
const secondItem: OrderItem = { id: "item-2", name: "Gadget", price: 19.99, quantity: 2 };

describe("addItemToOrderUseCase", () => {
  let repository: OrderRepository;

  beforeEach(() => {
    repository = new OrderRepository();
  });

  it("returns the updated order state with the new item", async () => {
    const created = await createOrderUseCase(repository, {
      customerId: "customer-1",
      firstItem,
    });

    const result = await addItemToOrderUseCase(repository, created.id, secondItem);

    expect(result.isOk()).toBe(true);
    const state = result._unsafeUnwrap();
    expect(state.items).toHaveLength(2);
    expect(state.items[1]).toEqual(secondItem);
  });

  it("persists the updated order in the repository", async () => {
    const created = await createOrderUseCase(repository, {
      customerId: "customer-1",
      firstItem,
    });

    await addItemToOrderUseCase(repository, created.id, secondItem);

    const persisted = (await repository.getById(created.id))._unsafeUnwrap();
    expect(persisted?.readState().items).toHaveLength(2);
    expect(persisted?.readState().items[1]).toEqual(secondItem);
  });

  it("stores an ORDER_ITEM_ADDED event", async () => {
    const created = await createOrderUseCase(repository, {
      customerId: "customer-1",
      firstItem,
    });

    await addItemToOrderUseCase(repository, created.id, secondItem);

    const events = (await repository.getEvents(created.id))._unsafeUnwrap();
    const addedEvent = events.find((e) => e.event.name === "ORDER_ITEM_ADDED");

    expect(addedEvent).toBeDefined();
    expect(addedEvent?.event.entityId).toBe(created.id);
    expect(addedEvent?.event.payload).toMatchObject({ item: secondItem });
  });

  it("returns ENTITY_NOT_FOUND when the order does not exist", async () => {
    const result = await addItemToOrderUseCase(repository, "unknown-id", secondItem);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.name).toBe("ENTITY_NOT_FOUND");
    }
  });

  it("returns INVALID_STATUS_TRANSITION when the order is not in DRAFT status", async () => {
    const created = await createOrderUseCase(repository, {
      customerId: "customer-1",
      firstItem,
    });
    await repository.getById(created.id).then(async (r) => {
      const order = r._unsafeUnwrap()!;
      order.place();
      await repository.save(order);
    });

    const result = await addItemToOrderUseCase(repository, created.id, secondItem);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.name).toBe("INVALID_STATUS_TRANSITION");
    }
  });
});
