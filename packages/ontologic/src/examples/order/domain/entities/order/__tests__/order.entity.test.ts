import { describe, it, expect } from "vitest";

import { Order, OrderItem } from "../order.entity";

const makeItem = (id: string): OrderItem => ({
  id,
  name: `Item ${id}`,
  price: 10,
  quantity: 1,
});

const makeOrderState = (
  overrides: Partial<Parameters<typeof Order.fromState>[2]> = {},
) => ({
  id: "order-1",
  customerId: "customer-1",
  status: "DRAFT" as const,
  items: [makeItem("item-1")],
  ...overrides,
});

describe("Order - orderHasAtLeastOneItem invariant", () => {
  describe("fromState", () => {
    it("does not throw when order has one item", () => {
      const entity = Order.fromState("order-1", 1, makeOrderState());
      expect(() => entity.readState()).not.toThrow();
    });

    it("does not throw when order has multiple items", () => {
      const entity = Order.fromState(
        "order-1",
        1,
        makeOrderState({ items: [makeItem("item-1"), makeItem("item-2")] }),
      );
      expect(() => entity.readState()).not.toThrow();
    });

    it("throws when order has no items", () => {
      const entity = Order.fromState(
        "order-1",
        1,
        makeOrderState({ items: [] }),
      );
      expect(() => entity.readState()).toThrow("Corrupted state detected");
    });
  });
});

describe("Order - removeItem", () => {
  it("removes an item successfully when more than one item exists", () => {
    const entity = Order.fromState(
      "order-1",
      1,
      makeOrderState({ items: [makeItem("item-1"), makeItem("item-2")] }),
    );

    const result = entity.removeItem({ itemId: "item-1" });

    expect(result.isOk()).toBe(true);
    expect(entity.readState().items).toHaveLength(1);
    expect(entity.readState().items[0]?.id).toBe("item-2");
  });

  it("returns an error when trying to remove the last item", () => {
    const entity = Order.fromState("order-1", 1, makeOrderState());

    const result = entity.removeItem({ itemId: "item-1" });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.name).toBe("ORDER_MUST_HAVE_AT_LEAST_ONE_ITEM");
    }
  });

  it("returns an error when order is not in DRAFT status", () => {
    const entity = Order.fromState(
      "order-1",
      1,
      makeOrderState({ status: "PLACED" }),
    );

    const result = entity.removeItem({ itemId: "item-1" });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.name).toBe("INVALID_STATUS_TRANSITION");
    }
  });
});

describe("Order - addItem", () => {
  it("adds an item when order is in DRAFT status", () => {
    const entity = Order.fromState("order-1", 1, makeOrderState());

    const result = entity.addItem({ item: makeItem("item-2") });

    expect(result.isOk()).toBe(true);
    expect(entity.readState().items).toHaveLength(2);
  });

  it("returns an error when order is not in DRAFT status", () => {
    const entity = Order.fromState(
      "order-1",
      1,
      makeOrderState({ status: "PLACED" }),
    );

    const result = entity.addItem({ item: makeItem("item-2") });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.name).toBe("INVALID_STATUS_TRANSITION");
    }
  });
});

describe("Order - applyVoucher", () => {
  it("applies a voucher when none is already applied", () => {
    const entity = Order.fromState("order-1", 1, makeOrderState());

    const result = entity.applyVoucher({ voucherId: "voucher-abc" });

    expect(result.isOk()).toBe(true);
    expect(entity.readState().voucherId).toBe("voucher-abc");
  });

  it("returns an error when a voucher is already applied", () => {
    const entity = Order.fromState(
      "order-1",
      1,
      makeOrderState({ voucherId: "voucher-abc" }),
    );

    const result = entity.applyVoucher({ voucherId: "voucher-xyz" });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.name).toBe("VOUCHER_ALREADY_APPLIED");
    }
  });

  it("returns an error when order is not in DRAFT status", () => {
    const entity = Order.fromState(
      "order-1",
      1,
      makeOrderState({ status: "PLACED" }),
    );

    const result = entity.applyVoucher({ voucherId: "voucher-abc" });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.name).toBe("INVALID_STATUS_TRANSITION");
    }
  });
});

describe("Order - place", () => {
  it("transitions from DRAFT to PLACED", () => {
    const entity = Order.fromState("order-1", 1, makeOrderState());

    const result = entity.place();

    expect(result.isOk()).toBe(true);
    expect(entity.readState().status).toBe("PLACED");
  });

  it("returns an error when order is already PLACED", () => {
    const entity = Order.fromState(
      "order-1",
      1,
      makeOrderState({ status: "PLACED" }),
    );

    const result = entity.place();

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.name).toBe("INVALID_STATUS_TRANSITION");
    }
  });

  it("returns an error when order is already PAID", () => {
    const entity = Order.fromState(
      "order-1",
      1,
      makeOrderState({ status: "PAID" }),
    );

    const result = entity.place();

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.name).toBe("INVALID_STATUS_TRANSITION");
    }
  });
});

describe("Order - pay", () => {
  it("transitions from PLACED to PAID and stores the invoiceId", () => {
    const entity = Order.fromState(
      "order-1",
      1,
      makeOrderState({ status: "PLACED" }),
    );

    const result = entity.pay({ invoiceId: "invoice-123" });

    expect(result.isOk()).toBe(true);
    expect(entity.readState().status).toBe("PAID");
    expect(entity.readState().invoiceId).toBe("invoice-123");
  });

  it("returns an error when order is in DRAFT status", () => {
    const entity = Order.fromState("order-1", 1, makeOrderState());

    const result = entity.pay({ invoiceId: "invoice-123" });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.name).toBe("INVALID_STATUS_TRANSITION");
    }
  });

  it("returns an error when order is already PAID", () => {
    const entity = Order.fromState(
      "order-1",
      1,
      makeOrderState({ status: "PAID", invoiceId: "invoice-123" }),
    );

    const result = entity.pay({ invoiceId: "invoice-456" });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.name).toBe("INVALID_STATUS_TRANSITION");
    }
  });
});

describe("Order - paidOrderHasInvoiceId invariant", () => {
  it("does not throw when a PAID order has an invoiceId", () => {
    const entity = Order.fromState(
      "order-1",
      1,
      makeOrderState({ status: "PAID", invoiceId: "invoice-123" }),
    );
    expect(() => entity.readState()).not.toThrow();
  });

  it("throws when a PAID order has no invoiceId", () => {
    const entity = Order.fromState(
      "order-1",
      1,
      makeOrderState({ status: "PAID" }),
    );
    expect(() => entity.readState()).toThrow("Corrupted state detected");
  });

  it("does not throw when a DRAFT order has no invoiceId", () => {
    const entity = Order.fromState("order-1", 1, makeOrderState());
    expect(() => entity.readState()).not.toThrow();
  });

  it("does not throw when a PLACED order has no invoiceId", () => {
    const entity = Order.fromState(
      "order-1",
      1,
      makeOrderState({ status: "PLACED" }),
    );
    expect(() => entity.readState()).not.toThrow();
  });
});
