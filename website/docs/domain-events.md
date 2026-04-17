---
sidebar_position: 3
---

# Domain Events

In Domain-Driven Design, a **Domain Event** is a record that something meaningful happened in your domain.

Not a log line. Not a notification. A first-class object that says: _"this thing happened, it's a fact, and it matters to the business."_

A few examples of domain events:

- `OrderPlaced`
- `PaymentFailed`
- `UserRegistered`
- `InventoryReserved`

Notice the naming pattern: **past tense**. That's intentional, and important. A domain event is not a command (_"PlaceOrder"_) and it is not a query (_"GetOrder"_). It is a **fact about the past**. It has already happened. It cannot be undone.

---

## Events are facts, not intentions

This distinction shapes how you think about them.

When you issue a command, it might fail. An order might be rejected. A payment might be declined. But once an event exists — once `OrderPlaced` has been emitted — it is a permanent record. The order _was_ placed. That's the truth, and nothing can change it.

This is why domain events use past tense: they record what already occurred, not what you hope will occur.

```typescript
// Not this — it's an instruction, not a fact
class PlaceOrder { ... }

// This — it records something that already happened
class OrderPlaced extends DomainEvent<"ORDER_PLACED", 1, { orderId: string; total: number }> {
  constructor(entityId: string, payload: { orderId: string; total: number }) {
    super({ name: "ORDER_PLACED", version: 1, entityId, payload });
  }
}
```

---

## Events are immutable

Because events describe the past, **you cannot change them**. You can't go back in time.

In `ontologic`, this is enforced at the library level: the payload is **deep-cloned** on construction. Once an event is created, no part of it can be mutated — not by the entity that produced it, not by the code that receives it.

```typescript
const event = new OrderPlaced("order-123", { orderId: "order-123", total: 99 });

// The payload is a clone — mutating it has no effect on the event
const payload = event.payload;
payload.total = 0; // This does nothing to the original event
```

This immutability is not just a technical detail. It reflects the nature of history: you can observe what happened, but you cannot rewrite it.

---

## Events are a shared contract

This is perhaps the most important thing to understand about domain events in practice: **they are public API**.

When you publish a domain event, other parts of the system will start listening to it. A `PaymentReceived` event might trigger an invoice generation, a shipping request, and a customer notification — in three different services. Once those consumers exist, **you cannot change the event's shape without coordinating with all of them**.

Think of it like a REST API endpoint: once it's in use, you own it. You can add fields in a backwards-compatible way, but you can't remove or rename them without breaking consumers.

This is why `ontologic` includes a **version number** on every event:

```typescript
class PaymentReceived extends DomainEvent<
  "PAYMENT_RECEIVED",
  1,
  { amount: number; currency: string }
> {
  constructor(entityId: string, payload: { amount: number; currency: string }) {
    super({ name: "PAYMENT_RECEIVED", version: 1, entityId, payload });
  }
}
```

When your domain evolves and you need to change the shape of an event, you create a new version instead of modifying the old one:

```typescript
// New version with additional context
class PaymentReceived extends DomainEvent<
  "PAYMENT_RECEIVED",
  2,
  { amount: number; currency: string; paymentMethod: string }
> {
  constructor(
    entityId: string,
    payload: { amount: number; currency: string; paymentMethod: string },
  ) {
    super({ name: "PAYMENT_RECEIVED", version: 2, entityId, payload });
  }
}
```

Consumers that still handle version 1 keep working. Consumers that need the new data can migrate to version 2. The version makes the contract explicit and evolution safe.

---

## Defining and emitting events with `ontologic`

You define a domain event by extending `DomainEvent` with three type parameters: the event name, the version, and the payload shape.

```typescript
import { DomainEvent } from "ontologic";

interface MoneyDepositedPayload {
  amount: number;
}

class MoneyDeposited extends DomainEvent<
  "MONEY_DEPOSITED",
  1,
  MoneyDepositedPayload
> {
  constructor(entityId: string, payload: MoneyDepositedPayload) {
    super({ name: "MONEY_DEPOSITED", version: 1, entityId, payload });
  }
}
```

Events are typically emitted from entity methods. When an operation succeeds, the method returns the event as its success value:

```typescript
class BankAccount extends DomainEntity<BankAccountState> {
  deposit(amount: number): MoneyDeposited {
    this.state.balance += amount;
    return new MoneyDeposited(this.id(), { amount });
  }
}
```

Or, when the operation can fail, using `Result`:

```typescript
class BankAccount extends DomainEntity<BankAccountState> {
  withdraw(amount: number): Result<MoneyWithdrawn, InsufficientFunds> {
    if (this.state.balance < amount) {
      return err(
        new InsufficientFunds({
          available: this.state.balance,
          requested: amount,
        }),
      );
    }

    this.state.balance -= amount;
    return ok(new MoneyWithdrawn(this.id(), { amount }));
  }
}
```

The caller receives the event and passes it to the repository, which persists the entity and the event **atomically** in a single transaction:

```typescript
const result = account.withdraw(200);

if (result.isOk()) {
  const event = result.value; // MoneyWithdrawn
  await repository.saveWithEvents(account, [event]);
}
```

Saving the entity and its events in the same transaction is important. If you saved them separately — entity first, then the event — a failure between the two would leave your system in an inconsistent state: the balance changed, but nobody was told. `ontologic`'s repository prevents this by guaranteeing you get both or neither.

### Publishing with the Outbox pattern

At this point the event is persisted, but nothing has been notified yet. You might be tempted to publish to a message bus immediately after the save — but that's a second operation that can fail independently of the first. Your database committed, but the broker was down for a second: the event is saved and will never be published.

The solution is the **Outbox pattern**. Instead of publishing directly, a background process reads unpublished events from the database and forwards them to the message bus. Because it reads from the same database that was written to in the transaction, it is guaranteed to eventually publish every event that was saved.

<video controls width="90%">
  <source src="/videos/MessageRelay.mp4" />
</video>

This separates two concerns that should never be coupled:

- **Writing** — the use case saves state and records what happened, transactionally
- **Publishing** — a reliable background process, the [Message Relay](/docs/message-relay.mdx), delivers events to the rest of the system

The use case stays simple. The delivery guarantee is handled by infrastructure, not by application code.

`ontologic` provides an [Event Bus](./event-bus.md) with a pluggable connector interface to handle the delivery side of this pattern.

---

## Not every state change needs an event

Returning an event from a method is **optional**. Not every mutation needs to produce one.

The question to ask is: _"Does something outside this entity care that this happened?"_

- If a withdrawal might trigger a low-balance notification, produce an event.
- If you're just updating a display name that nobody else cares about, maybe you don't need one.

The more important something is to the business — the more other systems or processes depend on it — the more it deserves to be captured as an explicit event.

---

## Events you can't assign to a single entity

Sometimes an event can only be produced at the **use case level**, because the entity alone doesn't have enough context.

Consider a referral program: when someone signs up using a friend's referral link, their account is opened and they immediately receive $50. The `BankAccount` entity knows how to create itself and how to apply a deposit — but it has no idea _why_ the money is there. That context only exists in the use case.

Yet _"an account was opened via referral"_ is exactly the kind of business fact worth capturing. The marketing team wants to know how many referrals are converting. The finance team wants to audit bonus payouts. Without an explicit event, that information is lost — buried in a generic deposit with no origin.

This is where the use case produces the event itself:

```typescript
interface ReferralAccountOpenedPayload {
  newAccountId: string;
  referrerId: string;
  bonusAmount: number;
}

class ReferralAccountOpened extends DomainEvent<
  "REFERRAL_ACCOUNT_OPENED",
  1,
  ReferralAccountOpenedPayload
> {
  constructor(entityId: string, payload: ReferralAccountOpenedPayload) {
    super({ name: "REFERRAL_ACCOUNT_OPENED", version: 1, entityId, payload });
  }
}

async function openAccountViaReferral(newUserId: string, referrerId: string) {
  const REFERRAL_BONUS = 50;

  const account = BankAccount.create({ ownerId: newUserId });
  account.deposit(REFERRAL_BONUS);

  const referralEvent = new ReferralAccountOpened(account.id(), {
    newAccountId: account.id(),
    referrerId,
    bonusAmount: REFERRAL_BONUS,
  });

  await repository.saveWithEvents(account, [referralEvent]);
}
```

The entity handles the mechanics. The use case holds the meaning.

The rule of thumb: if the event can be produced with only the entity's internal state, let the entity produce it. If the event requires knowledge that only the use case has, produce it in the use case.

---

## Summary

| Property            | What it means                                                                    |
| ------------------- | -------------------------------------------------------------------------------- |
| **Past tense name** | Events record facts, not intentions — something that already happened            |
| **Immutable**       | The payload is frozen at creation — you cannot rewrite history                   |
| **Versioned**       | Events are a shared contract; versioning lets the contract evolve safely         |
| **Optional**        | Not every state change needs an event — only ones that matter outside the entity |

Domain events make your system's history explicit. Instead of inferring what happened from the current state of a database, you have a precise, typed record of every meaningful thing that occurred — who did it, when, and with what data.

That record is what makes systems observable, evolvable, and trustworthy.
