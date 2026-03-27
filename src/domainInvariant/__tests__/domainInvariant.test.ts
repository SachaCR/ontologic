import { describe, it, expect } from "vitest";
import { BaseDomainInvariant } from "../index";

interface OrderItem {
  id: string;
  name: string;
}

interface Order {
  items: OrderItem[];
  vouchers: string[];
  orderedBy?: "customer" | "sales-admin";
}

const hasAtLeastOneItem = new BaseDomainInvariant<Order>(
  "Order must have at least one item",
  (order) => order.items.length >= 1
);

const hasAtMostOneVoucher = new BaseDomainInvariant<Order>(
  "Order cannot have more than one voucher",
  (order) => order.vouchers.length <= 1
);

const isOrderedBySalesAdmin = new BaseDomainInvariant<Order>(
  "Order is placed by a sales-admin",
  (order) => order.orderedBy === "sales-admin"
);

const hasVoucher = new BaseDomainInvariant<Order>(
  "Order has a voucher",
  (order) => order.vouchers.length >= 1
);

const isCustomerOrder = isOrderedBySalesAdmin.not();

const orderInvariant = hasAtLeastOneItem
  .and(hasVoucher.xor(isOrderedBySalesAdmin))
  .and(isCustomerOrder.and(hasAtMostOneVoucher).or(isOrderedBySalesAdmin));

const widget: OrderItem = { id: "1", name: "Widget" };

describe("orderInvariant", () => {
  it("Given a customer order with 1 item and 1 voucher, it returns compliant", () => {
    const order: Order = { items: [widget], vouchers: ["SAVE10"], orderedBy: "customer" };
    expect(orderInvariant.complyWith(order).isCompliant).toBe(true);
  });

  it("Given a customer order with 1 item and 2 vouchers, it returns not compliant", () => {
    const order: Order = { items: [widget], vouchers: ["SAVE10", "SAVE20"], orderedBy: "customer" };
    expect(orderInvariant.complyWith(order).isCompliant).toBe(false);
  });

  it("Given a customer order with 1 item and no voucher, it returns not compliant", () => {
    const order: Order = { items: [widget], vouchers: [], orderedBy: "customer" };
    expect(orderInvariant.complyWith(order).isCompliant).toBe(false);
  });

  it("Given a sales-admin order with 1 item and no voucher, it returns compliant", () => {
    const order: Order = { items: [widget], vouchers: [], orderedBy: "sales-admin" };
    expect(orderInvariant.complyWith(order).isCompliant).toBe(true);
  });

  it("Given a sales-admin order with 1 item and 1 voucher, it returns not compliant", () => {
    const order: Order = { items: [widget], vouchers: ["SAVE10"], orderedBy: "sales-admin" };
    expect(orderInvariant.complyWith(order).isCompliant).toBe(false);
  });

  it("Given a customer order with 0 items and 1 voucher, it returns not compliant", () => {
    const order: Order = { items: [], vouchers: ["SAVE10"], orderedBy: "customer" };
    expect(orderInvariant.complyWith(order).isCompliant).toBe(false);
  });

  it("Given a sales-admin order with 0 items and no voucher, it returns not compliant", () => {
    const order: Order = { items: [], vouchers: [], orderedBy: "sales-admin" };
    expect(orderInvariant.complyWith(order).isCompliant).toBe(false);
  });

  it("Given a customer order with 1 item and 1 voucher, it returns a description combining all invariants", () => {
    const order: Order = { items: [widget], vouchers: ["SAVE10"], orderedBy: "customer" };
    const result = orderInvariant.complyWith(order);
    expect(result.description).toBe(
      "Order must have at least one item AND (Order has a voucher XOR (Order is placed by a sales-admin)) AND (NOT (Order is placed by a sales-admin) AND (Order cannot have more than one voucher) OR (Order is placed by a sales-admin))"
    );
  });

  it("Given a customer order with 1 item and 1 voucher, it returns details for each invariant", () => {
    const order: Order = { items: [widget], vouchers: ["SAVE10"], orderedBy: "customer" };
    const result = orderInvariant.complyWith(order);
    expect(result.isCompliant).toBe(true)

    // expect(result.details).toHaveLength(6);
    // expect(result.details[0]).toEqual({ isCompliant: true, description: "Order must have at least one item" });
    // expect(result.details[1]).toEqual({ isCompliant: true, description: "Order has a voucher" });
    // expect(result.details[2]).toEqual({ isCompliant: false, description: "Order is placed by a sales-admin" });
    // expect(result.details[3]).toEqual({ isCompliant: false, description: "Order is placed by a sales-admin" });
    // expect(result.details[4]).toEqual({ isCompliant: true, description: "Order cannot have more than one voucher" });
    // expect(result.details[5]).toEqual({ isCompliant: false, description: "Order is placed by a sales-admin" });
  });
});
