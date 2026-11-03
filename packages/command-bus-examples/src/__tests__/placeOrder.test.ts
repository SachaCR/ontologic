import { describe, it, expect } from "vitest";

import {
  EmptyOrderError,
  handlePlaceOrder,
  parsePlaceOrder,
  placeOrder,
  PlaceOrderCommand,
} from "../domain/placeOrder";

function command(items: { sku: string; quantity: number }[]) {
  return new PlaceOrderCommand({
    orderId: "order-1",
    customerId: "customer-1",
    items,
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

describe("parsePlaceOrder", () => {
  it("rebuilds a PlaceOrderCommand from its JSON form", () => {
    // The bus stringifies commands, so this is exactly what the receiver gets.
    const wire = JSON.parse(
      JSON.stringify(command([{ sku: "BOOK-1", quantity: 2 }])),
    );

    expect(parsePlaceOrder(wire)).toBeInstanceOf(PlaceOrderCommand);
  });

  it("keeps the payload through the JSON round trip", () => {
    const sent = command([{ sku: "BOOK-1", quantity: 2 }]);

    const received = parsePlaceOrder(JSON.parse(JSON.stringify(sent)));

    expect(received.payload).toEqual(sent.payload);
  });

  it("refuses another command", () => {
    expect(() =>
      parsePlaceOrder({ name: "CANCEL_ORDER", payload: {} }),
    ).toThrow("Expected a PLACE_ORDER command, got CANCEL_ORDER");
  });

  it("refuses a payload with missing fields", () => {
    expect(() =>
      parsePlaceOrder({ name: "PLACE_ORDER", payload: { orderId: "o-1" } }),
    ).toThrow("PLACE_ORDER: invalid payload");
  });
});

describe("placeOrder", () => {
  it("puts the command id and correlation id in the metadata", () => {
    const { metadata } = placeOrder({
      id: "cmd-1",
      orderId: "order-1",
      customerId: "customer-1",
      items: [],
      correlationId: "corr-1",
    });

    expect(metadata).toMatchObject({ id: "cmd-1", correlationId: "corr-1" });
  });
});
