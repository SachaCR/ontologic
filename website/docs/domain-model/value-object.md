---
sidebar_position: 2
---

# Value Object

A [Domain Entity](./domain-entity.md) is defined by **who it is**. A **Value Object** is defined by **what it is**.

Two bank accounts with the same balance are still two different accounts — they have identities, and one can change without the other changing. But two amounts of `€50` are simply the same amount. There is no "which €50" — the question doesn't mean anything. Money has no identity, only a value.

That difference has a practical consequence: an entity's state changes over its lifetime, while a value object is replaced wholesale. You don't "change" `€50` into `€70`; you throw it away and use `€70` instead.

---

## Why not just use a plain object?

You could represent money as `{ amount: 50, currency: "EUR" }`. Nothing stops you. But nothing stops anyone else, either:

```typescript
const price = { amount: -50, currency: "EUR" };   // negative money
const total = { amount: 50, currency: "PIZZA" };  // not a currency
price.amount = 999;                                // mutated from the outside
```

Every rule about what makes a valid amount of money now lives wherever somebody remembered to write it. A value object gathers those rules in one place and enforces them on construction, so an invalid instance cannot exist.

---

## Defining a value object

`ValueObject<State>` is the same machinery as `DomainEntity`, minus the identity and the version:

```typescript
import { ValueObject, BaseDomainInvariant } from "ontologic";

interface MoneyState {
  amount: number;
  currency: string;
}

const amountIsPositive = new BaseDomainInvariant<MoneyState>(
  "Amount must be >= 0",
  (state) => state.amount >= 0,
);

export class Money extends ValueObject<MoneyState> {
  private constructor(state: MoneyState) {
    super(state, { invariants: [amountIsPositive] });
  }

  static make(amount: number, currency = "EUR"): Money {
    return new Money({ amount, currency });
  }

  add(other: Money): Money {
    const otherState = other.readState();

    if (otherState.currency !== this.state.currency) {
      throw new Error("Cannot add amounts in different currencies");
    }

    // Return a NEW instance — never mutate a value object.
    return Money.make(this.state.amount + otherState.amount, this.state.currency);
  }
}
```

Two things to notice:

- **Invariants run in the constructor.** `Money.make(-10)` throws `CorruptedStateError` immediately. There is no window in which an invalid `Money` exists.
- **Behavior returns new instances.** `add` does not mutate `this.state`; it produces a new `Money`. This is what "no identity" means in practice.

You can pass invariants through the constructor options as above, or attach them with `addInvariant()` after construction — both work, but the options form is preferable because the rule is then enforced from the very first moment.

---

## Reading the state

The accessors mirror `DomainEntity` exactly:

```typescript
money.readState();        // invariant check + safe copy   (default, use this)
money.unsafeReadState();  // invariant check, no copy      (Readonly<State>)
money.unsafeRawState();   // no check, no copy             (cheapest, fully on you)
```

`readState()` deep-clones by default, so callers cannot reach back into the value object and mutate it. Reach for the unsafe variants only when a profiler tells you the clone matters, and never mutate what they hand back.

When an invariant fails, `CorruptedStateError` is thrown with `entityId` set to the class name — a value object has no id to report.

---

## Custom serialization

Like `DomainEntity`, `ValueObject` takes a second type parameter and a `serialize` option for states holding live class instances that `structuredClone` would strip of their prototypes:

```typescript
class Line extends ValueObject<LineState, LineSnapshot> {
  constructor(state: LineState) {
    super(state, {
      serialize: (s) => ({ sku: s.sku, total: s.price * s.quantity }),
    });
  }
}
```

When `Serialized` differs from `State`, you **must** provide `serialize` — the `structuredClone` default cannot produce it. And as with entities, `serialize` is not persistence: its only job is to decouple the returned value from the internals. See [Domain Entity](./domain-entity.md) for the full discussion.

---

## Value object or entity?

| Question | Answer |
|---|---|
| Do two instances with identical fields mean the same thing? | Value Object |
| Does it need to be tracked over time, across changes? | Entity |
| Would you ever store it in its own table with its own id? | Entity |
| Is it replaced wholesale rather than modified? | Value Object |
| Does it emit domain events? | Entity |

Money, dates, addresses, coordinates, email addresses, quantities, and ranges are almost always value objects. Orders, users, accounts, and shipments are almost always entities.

A value object can live inside an entity's state — that is the common case, and it is exactly why the `serialize` option exists.

---

## Summary

| Concept | `DomainEntity` | `ValueObject` |
|---|---|---|
| Identity | `id()` | none |
| Version / optimistic locking | `version()`, `setVersion()` | none |
| Invariants | yes | yes |
| Domain events | yes | no |
| Changes over time | mutates its state | replaced by a new instance |

A value object is the smallest useful unit of domain modelling: a name, a shape, and the rules that make it valid. Reach for one whenever you catch yourself passing a bare `number` or `string` that has rules attached to it.
