import { describe, it, expect } from "vitest";

import { DomainEntity } from "../domainEntity";
import { InMemoryRepository } from "../inMemoryRepository";
import { DomainEventInterface } from "../domainEvent";

/**
 * A sub-entity carrying domain logic. The whole point of the `serialize` hook
 * is to let an aggregate hold live instances like this in its state without
 * `structuredClone` stripping `subtotal()` off the prototype.
 */
interface OrderLineState {
  sku: string;
  quantity: number;
  unitPrice: number;
}

class OrderLine {
  constructor(private readonly state: OrderLineState) {}

  subtotal(): number {
    return this.state.quantity * this.state.unitPrice;
  }

  serialize(): OrderLineState {
    return { ...this.state };
  }

  static fromState(state: OrderLineState): OrderLine {
    return new OrderLine({ ...state });
  }
}

interface CartState {
  lines: OrderLine[];
}

// The decoupled, plain form `readState()` hands out and the repository stores.
interface CartSnapshot {
  lines: OrderLineState[];
}

const serializeCart = (state: CartState): CartSnapshot => ({
  lines: state.lines.map((line) => line.serialize()),
});

class Cart extends DomainEntity<CartState, CartSnapshot> {
  static make(id: string, lines: OrderLine[]): Cart {
    return new Cart(id, { lines }, { serialize: serializeCart });
  }

  // Rehydrates live sub-entities from a plain snapshot — this is the mapper the
  // repository uses on read.
  static fromSnapshot(id: string, snapshot: CartSnapshot): Cart {
    const lines = snapshot.lines.map(OrderLine.fromState);
    return new Cart(id, { lines }, { serialize: serializeCart });
  }

  total(): number {
    return this.state.lines.reduce((sum, line) => sum + line.subtotal(), 0);
  }
}

describe("aggregate holding live sub-entities", () => {
  it("keeps sub-entity domain logic usable internally", () => {
    const cart = Cart.make("cart-1", [
      OrderLine.fromState({ sku: "A", quantity: 2, unitPrice: 10 }),
      OrderLine.fromState({ sku: "B", quantity: 1, unitPrice: 5 }),
    ]);

    // total() calls subtotal() on the live sub-entities — proof the prototypes
    // survived construction (no clone stripped them).
    expect(cart.total()).toBe(25);
  });

  it("readState() returns a plain, method-free snapshot", () => {
    const cart = Cart.make("cart-1", [
      OrderLine.fromState({ sku: "A", quantity: 2, unitPrice: 10 }),
    ]);

    const snapshot = cart.readState();

    expect(snapshot.lines[0]).not.toBeInstanceOf(OrderLine);
    expect(snapshot.lines[0]).toEqual({ sku: "A", quantity: 2, unitPrice: 10 });
  });

  it("readState() snapshot is decoupled from the aggregate's internals", () => {
    const cart = Cart.make("cart-1", [
      OrderLine.fromState({ sku: "A", quantity: 2, unitPrice: 10 }),
    ]);

    const snapshot = cart.readState();
    snapshot.lines[0]!.quantity = 999;

    expect(cart.total()).toBe(20);
  });

  it("round-trips through InMemoryRepository with sub-entities intact", async () => {
    const repository = new InMemoryRepository<Cart, DomainEventInterface>(
      Cart.fromSnapshot,
    );
    const cart = Cart.make("cart-1", [
      OrderLine.fromState({ sku: "A", quantity: 2, unitPrice: 10 }),
      OrderLine.fromState({ sku: "B", quantity: 3, unitPrice: 5 }),
    ]);

    await repository.save(cart);
    const result = await repository.getById("cart-1");

    const loaded = result._unsafeUnwrap();
    expect(loaded).toBeDefined();
    // The rehydrated aggregate can run sub-entity logic again.
    expect(loaded!.total()).toBe(35);
  });
});
