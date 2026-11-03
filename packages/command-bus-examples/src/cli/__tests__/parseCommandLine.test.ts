import { describe, it, expect } from "vitest";

import { parseCommandLine } from "../parseCommandLine";

describe("parseCommandLine", () => {
  it("reads a place command with its items", () => {
    expect(parseCommandLine("place order-1 BOOK-1:2 PEN-3:1")).toEqual({
      kind: "place",
      orderId: "order-1",
      items: [
        { sku: "BOOK-1", quantity: 2 },
        { sku: "PEN-3", quantity: 1 },
      ],
    });
  });

  it("reads a place command with no items", () => {
    expect(parseCommandLine("place order-2")).toEqual({
      kind: "place",
      orderId: "order-2",
      items: [],
    });
  });

  it("ignores extra spaces", () => {
    expect(parseCommandLine("  place   order-1   BOOK-1:2  ")).toEqual({
      kind: "place",
      orderId: "order-1",
      items: [{ sku: "BOOK-1", quantity: 2 }],
    });
  });

  it("refuses an item that is not sku:qty", () => {
    expect(parseCommandLine("place order-1 BOOK-1")).toEqual({
      kind: "invalid",
      reason: '"BOOK-1" is not an item: write it sku:qty, e.g. BOOK-1:2',
    });
  });

  it("refuses a quantity of zero", () => {
    expect(parseCommandLine("place order-1 BOOK-1:0").kind).toBe("invalid");
  });

  it("refuses a place command with no order id", () => {
    expect(parseCommandLine("place")).toEqual({
      kind: "invalid",
      reason: "place needs an order id: place <orderId> [sku:qty ...]",
    });
  });

  it("reads simulate with its default count", () => {
    expect(parseCommandLine("simulate")).toEqual({
      kind: "simulate",
      count: 10,
    });
  });

  it("reads simulate with a count", () => {
    expect(parseCommandLine("simulate 25")).toEqual({
      kind: "simulate",
      count: 25,
    });
  });

  it("refuses a simulate count above 100", () => {
    expect(parseCommandLine("simulate 500")).toEqual({
      kind: "invalid",
      reason: 'simulate needs a count between 1 and 100, got "500"',
    });
  });

  it("refuses a simulate count that is not a number", () => {
    expect(parseCommandLine("simulate lots").kind).toBe("invalid");
  });

  it.each(["help", "?"])("reads %s as help", (line) => {
    expect(parseCommandLine(line)).toEqual({ kind: "help" });
  });

  it.each(["quit", "exit"])("reads %s as quit", (line) => {
    expect(parseCommandLine(line)).toEqual({ kind: "quit" });
  });

  it("reads a blank line as empty", () => {
    expect(parseCommandLine("   ")).toEqual({ kind: "empty" });
  });

  it("refuses an unknown command", () => {
    expect(parseCommandLine("cancel order-1")).toEqual({
      kind: "invalid",
      reason: 'Unknown command "cancel". Type help to see the commands',
    });
  });
});
