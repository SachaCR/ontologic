import { describe, it, expect } from "vitest";
import { BaseDomainInvariant } from "../../index";

interface Order {
  orderedBy?: "customer" | "sales-admin";
}

const isOrderedBySalesAdmin = new BaseDomainInvariant<Order>(
  "Order is placed by a sales-admin",
  (order) => order.orderedBy === "sales-admin",
);

const invariant = isOrderedBySalesAdmin.not();

describe("not", () => {
  it("Given an order placed by a customer, it returns compliant", () => {
    const order: Order = { orderedBy: "customer" };
    expect(invariant.complyWith(order).isCompliant).toBe(true);
  });

  it("Given an order placed by a sales-admin, it returns not compliant", () => {
    const order: Order = { orderedBy: "sales-admin" };
    expect(invariant.complyWith(order).isCompliant).toBe(false);
  });

  it("Given a compliant order, it returns a description wrapping the original invariant", () => {
    const order: Order = { orderedBy: "customer" };
    const result = invariant.complyWith(order);
    expect(result.description).toBe("NOT (Order is placed by a sales-admin)");
  });
});
