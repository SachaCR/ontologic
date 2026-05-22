import { describe, it, expect } from "vitest";
import { BaseDomainInvariant } from "../../index";

interface Order {
  items: string[];
  orderedBy?: "customer" | "sales-admin";
}

const hasAtLeastOneItem = new BaseDomainInvariant<Order>(
  "Order must have at least one item",
  (order) => order.items.length >= 1,
);

const isOrderedBySalesAdmin = new BaseDomainInvariant<Order>(
  "Order is placed by a sales-admin",
  (order) => order.orderedBy === "sales-admin",
);

const invariant = hasAtLeastOneItem.andNot(isOrderedBySalesAdmin);

describe("andNot", () => {
  it("Given a customer order with 1 item, it returns compliant", () => {
    const order: Order = { items: ["Widget"], orderedBy: "customer" };
    expect(invariant.complyWith(order).isCompliant).toBe(true);
  });

  it("Given a sales-admin order with 1 item, it returns not compliant", () => {
    const order: Order = { items: ["Widget"], orderedBy: "sales-admin" };
    expect(invariant.complyWith(order).isCompliant).toBe(false);
  });

  it("Given a customer order with 0 items, it returns not compliant", () => {
    const order: Order = { items: [], orderedBy: "customer" };
    expect(invariant.complyWith(order).isCompliant).toBe(false);
  });

  it("Given a sales-admin order with 0 items, it returns not compliant", () => {
    const order: Order = { items: [], orderedBy: "sales-admin" };
    expect(invariant.complyWith(order).isCompliant).toBe(false);
  });

  it("Given a compliant order, it returns a description combining both invariants", () => {
    const order: Order = { items: ["Widget"], orderedBy: "customer" };
    const result = invariant.complyWith(order);
    expect(result.description).toBe(
      "Order must have at least one item AND NOT (Order is placed by a sales-admin)",
    );
  });
});
