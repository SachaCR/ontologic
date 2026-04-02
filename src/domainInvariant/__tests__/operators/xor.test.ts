import { describe, it, expect } from "vitest";
import { BaseDomainInvariant } from "../../index";

interface Order {
  vouchers: string[];
  orderedBy?: "customer" | "sales-admin";
}

const hasVoucher = new BaseDomainInvariant<Order>(
  "Order has a voucher",
  (order) => order.vouchers.length >= 1,
);

const isOrderedBySalesAdmin = new BaseDomainInvariant<Order>(
  "Order is placed by a sales-admin",
  (order) => order.orderedBy === "sales-admin",
);

const invariant = hasVoucher.xor(isOrderedBySalesAdmin);

describe("xor", () => {
  it("Given an order with a voucher placed by a customer, it returns compliant", () => {
    const order: Order = { vouchers: ["SAVE10"], orderedBy: "customer" };
    expect(invariant.complyWith(order).isCompliant).toBe(true);
  });

  it("Given an order without a voucher placed by a sales-admin, it returns compliant", () => {
    const order: Order = { vouchers: [], orderedBy: "sales-admin" };
    expect(invariant.complyWith(order).isCompliant).toBe(true);
  });

  it("Given an order with a voucher placed by a sales-admin, it returns not compliant", () => {
    const order: Order = { vouchers: ["SAVE10"], orderedBy: "sales-admin" };
    expect(invariant.complyWith(order).isCompliant).toBe(false);
  });

  it("Given an order without a voucher placed by a customer, it returns not compliant", () => {
    const order: Order = { vouchers: [], orderedBy: "customer" };
    expect(invariant.complyWith(order).isCompliant).toBe(false);
  });

  it("Given a compliant order, it returns a description combining both invariants", () => {
    const order: Order = { vouchers: ["SAVE10"], orderedBy: "customer" };
    const result = invariant.complyWith(order);
    expect(result.description).toBe(
      "Order has a voucher XOR (Order is placed by a sales-admin)",
    );
  });
});
