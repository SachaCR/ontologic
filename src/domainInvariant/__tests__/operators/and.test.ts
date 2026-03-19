import { describe, it, expect } from "vitest";
import { BaseDomainInvariant } from "../../index";

interface Order {
  items: string[];
  vouchers: string[];
}

const hasAtLeastOneItem = new BaseDomainInvariant<Order>(
  "Order must have at least one item",
  (order) => order.items.length >= 1
);

const hasAtMostOneVoucher = new BaseDomainInvariant<Order>(
  "Order cannot have more than one voucher",
  (order) => order.vouchers.length <= 1
);

const invariant = hasAtLeastOneItem.and(hasAtMostOneVoucher);

describe("and", () => {
  it("Given an order with 1 item and 1 voucher, it returns compliant", () => {
    const order: Order = { items: ["Widget"], vouchers: ["SAVE10"] };
    expect(invariant.complyWith(order).isCompliant).toBe(true);
  });

  it("Given an order with 0 items and 1 voucher, it returns not compliant", () => {
    const order: Order = { items: [], vouchers: ["SAVE10"] };
    expect(invariant.complyWith(order).isCompliant).toBe(false);
  });

  it("Given an order with 1 item and 2 vouchers, it returns not compliant", () => {
    const order: Order = { items: ["Widget"], vouchers: ["SAVE10", "SAVE20"] };
    expect(invariant.complyWith(order).isCompliant).toBe(false);
  });

  it("Given an order with 0 items and 2 vouchers, it returns not compliant", () => {
    const order: Order = { items: [], vouchers: ["SAVE10", "SAVE20"] };
    expect(invariant.complyWith(order).isCompliant).toBe(false);
  });

  it("Given a compliant order, it returns a description combining both invariants", () => {
    const order: Order = { items: ["Widget"], vouchers: ["SAVE10"] };
    const result = invariant.complyWith(order);
    expect(result.description).toBe(
      "Order must have at least one item AND (Order cannot have more than one voucher)"
    );
  });

});
