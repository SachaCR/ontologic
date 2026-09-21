import { describe, it, expect } from "vitest";

import {
  EmptyOrderError,
  handlePlaceOrder,
  placeOrderCommand,
} from "../domain/placeOrder";

function command(items: { sku: string; quantity: number }[]) {
  return placeOrderCommand({
    id: "cmd-1",
    orderId: "order-1",
    customerId: "customer-1",
    items,
    correlationId: "corr-1",
  });
}

describe("handlePlaceOrder", () => {
  it("accepts an order and totals its items", async () => {
    const result = await handlePlaceOrder(
      command([
        { sku: "BOOK-1", quantity: 2 },
        { sku: "PEN-3", quantity: 1 },
      ]),
    );

    expect(result._unsafeUnwrap()).toEqual({
      orderId: "order-1",
      status: "PLACED",
      itemCount: 3,
    });
  });

  it("refuses an order with no item", async () => {
    const result = await handlePlaceOrder(command([]));

    expect(result._unsafeUnwrapErr()).toBeInstanceOf(EmptyOrderError);
  });

  it("refuses with a name a caller can branch on", async () => {
    const result = await handlePlaceOrder(command([]));

    expect(result._unsafeUnwrapErr().name).toBe("EMPTY_ORDER");
  });
});

describe("placeOrderCommand", () => {
  it("builds an envelope that survives a JSON round trip", async () => {
    // The bus stringifies commands, so anything that does not survive this is
    // not a command.
    const built = command([{ sku: "BOOK-1", quantity: 2 }]);

    expect(JSON.parse(JSON.stringify(built))).toEqual(built);
  });
});
