import { describe, it, expect, beforeEach } from "vitest";

import { OrderRepository } from "../../../order.repository";
import { CreateOrderUseCase } from "../createOrder.use-case";
import { AddItemToOrderUseCase } from "../addItemToOrder.use-case";
import { CreateOrderCommand } from "../commands/createOrder.command";
import { AddItemToOrderCommand } from "../commands/addItemToOrder.command";
import { OrderItem } from "../../entities/order/order.entity";

const firstItem: OrderItem = {
  id: "item-1",
  name: "Widget",
  price: 9.99,
  quantity: 1,
};
const secondItem: OrderItem = {
  id: "item-2",
  name: "Gadget",
  price: 19.99,
  quantity: 2,
};

describe("AddItemToOrderUseCase", () => {
  let repository: OrderRepository;
  let createOrder: CreateOrderUseCase;
  let addItemToOrder: AddItemToOrderUseCase;

  beforeEach(() => {
    repository = new OrderRepository();
    createOrder = new CreateOrderUseCase(repository);
    addItemToOrder = new AddItemToOrderUseCase(repository);
  });

  const setupDraftOrder = async (): Promise<string> => {
    const created = await createOrder.execute(
      new CreateOrderCommand({ customerId: "customer-1", firstItem }),
    );

    return created._unsafeUnwrap().id;
  };

  it("returns the updated order state with the new item", async () => {
    const orderId = await setupDraftOrder();

    const result = await addItemToOrder.execute(
      new AddItemToOrderCommand({ id: orderId, item: secondItem }),
    );

    expect(result.isOk()).toBe(true);
    const state = result._unsafeUnwrap();
    expect(state.items).toHaveLength(2);
    expect(state.items[1]).toEqual(secondItem);
  });

  it("persists the updated order in the repository", async () => {
    const orderId = await setupDraftOrder();

    await addItemToOrder.execute(
      new AddItemToOrderCommand({ id: orderId, item: secondItem }),
    );

    const persisted = (await repository.getById(orderId))._unsafeUnwrap();
    expect(persisted?.readState().items).toHaveLength(2);
    expect(persisted?.readState().items[1]).toEqual(secondItem);
  });

  it("stores an ORDER_ITEM_ADDED event", async () => {
    const orderId = await setupDraftOrder();

    await addItemToOrder.execute(
      new AddItemToOrderCommand({ id: orderId, item: secondItem }),
    );

    const events = (await repository.getEvents(orderId))._unsafeUnwrap();
    const addedEvent = events.find((e) => e.event.name === "ORDER_ITEM_ADDED");

    expect(addedEvent).toBeDefined();
    expect(addedEvent?.event.entityId).toBe(orderId);
    expect(addedEvent?.event.payload).toMatchObject({ item: secondItem });
  });

  it("returns ENTITY_NOT_FOUND when the order does not exist", async () => {
    const result = await addItemToOrder.execute(
      new AddItemToOrderCommand({ id: "unknown-id", item: secondItem }),
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.name).toBe("ENTITY_NOT_FOUND");
    }
  });

  it("returns INVALID_STATUS_TRANSITION when the order is not in DRAFT status", async () => {
    const orderId = await setupDraftOrder();
    await repository.getById(orderId).then(async (r) => {
      const order = r._unsafeUnwrap()!;
      order.place();
      await repository.save(order);
    });

    const result = await addItemToOrder.execute(
      new AddItemToOrderCommand({ id: orderId, item: secondItem }),
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.name).toBe("INVALID_STATUS_TRANSITION");
    }
  });
});
