# Domain Entity

Domain-Driven Design (DDD) is an approach to software development that puts the **business domain** at the center of your code. Rather than thinking in terms of database tables or HTTP endpoints, you model the real world: its concepts, its rules, its vocabulary.

A **Domain Entity** is one of the core building blocks of DDD. It represents a meaningful concept in your domain that has:

- A **unique identity** that persists over time
- A **lifecycle** — it is created, it changes, and eventually it may be deleted
- **Behavior** — it doesn't just hold data, it knows how to act on it

Think of a bank account. It has an ID, it can be credited and debited, and it has rules (e.g. you can't spend more than you have). It's a perfect candidate for a Domain Entity.

---

## The problem with plain objects

Before diving into how `ontologic` helps, let's look at what happens without it.

```typescript
// A plain object — no rules, no protection
const account = {
  id: "abc-123",
  balance: 100,
};

// Anyone can do this — there's nothing stopping it
account.balance = -9999;
```

Nothing prevents invalid state. The balance constraint lives... nowhere? In some validator function somewhere? In the controller? In the database? It's scattered and easy to forget.

DDD says: the object itself should be responsible for staying valid.

---

## State Encapsulation

The first thing a Domain Entity does is **own its state**. External code can read it, but cannot mutate it directly.

With `ontologic`, you extend `DomainEntity` and keep your state internal:

```typescript
import { DomainEntity } from "ontologic";

interface BankAccountState {
  ownerId: string;
  balance: number;
}

class BankAccount extends DomainEntity<BankAccountState> {
  static create(params: { ownerId: string }): BankAccount {
    const id = randomUUID();
    return new BankAccount(id, {
      ownerId: params.ownerId,
      balance: 0,
    });
  }

  deposit(amount: number): void {
    this.state.balance += amount;
  }

  getBalance(): number {
    return this.state.balance;
  }
}
```

The `state` property is `protected` — only the entity and its subclasses can touch it. When you call `readState()`, you get back a **deep clone**, so there's no way for outside code to accidentally mutate the internal state.

This is encapsulation in the DDD sense: **the entity controls all changes to itself**.

---

## Invariants

An **invariant** is a rule that must always be true about your entity. No matter what operation you perform, the entity should never end up in a state that violates it.

A classic invariant for a bank account: *the balance must never be negative*.

With `ontologic`, you express this as a `BaseDomainInvariant`:

```typescript
import { BaseDomainInvariant } from "ontologic";

const balanceIsPositive = new BaseDomainInvariant<BankAccountState>(
  "Balance must be positive",
  (state) => state.balance >= 0
);
```

Then you attach it to your entity:

```typescript
class BankAccount extends DomainEntity<BankAccountState> {
  constructor(id: string, state: BankAccountState) {
    super(id, state);
    this.addInvariant(balanceIsPositive);
  }
  // ...
}
```

From this point on, **every time the state is read**, the invariant is checked. If the state is ever found in violation, an error is thrown immediately — before any corrupted data can propagate through the system.

```typescript
// This will throw "Corrupted state detected" at read time
const account = BankAccount.fromState("abc-123", { ownerId: "u1", balance: -50 });
account.readState(); // throws!
```

Invariants also compose. You can combine them with logical operators:

```typescript
const balanceIsPositive = new BaseDomainInvariant<State>(
  "Balance is positive",
  (state) => state.balance >= 0
);

const balanceIsReasonable = new BaseDomainInvariant<State>(
  "Balance is under limit",
  (state) => state.balance <= 1_000_000
);

// Both must hold
const validBalance = balanceIsPositive.and(balanceIsReasonable);

// Logical operators available: .and() .or() .not() .xor() .andNot()
```

This lets you build complex business rules from simple, readable, named pieces.

---

## Domain Logic

Domain logic is **behavior that belongs to the entity itself**, not to a service or a controller. If the bank account knows how to validate a withdrawal, you never need to duplicate that check anywhere else in the codebase.

In `ontologic`, you express domain logic as methods on your entity. When a business rule can fail, you return a `Result<Success, DomainError>` instead of throwing.

But `Result` is not meant to wrap every possible failure — only **domain failures**. The distinction matters:

- An **insufficient funds** error is a domain error. It is a valid, expected branch of the business logic. The caller must handle it explicitly, because it is part of the domain's vocabulary.
- A **JSON parse failure** or a database connection timeout is a technical error. It is unexpected, it is not part of the domain, and it should be thrown and caught at the application boundary like any other exception.

Using `Result` for technical errors would pollute every call site with error handling for things that are not the domain's concern. Reserve it for failures that have **business meaning**.

```typescript
import { Result, ok, err, DomainError } from "ontologic";

class InsufficientFunds extends DomainError<"INSUFFICIENT_FUNDS", { available: number; requested: number }> {
  constructor(context: { available: number; requested: number }) {
    super({
      name: "INSUFFICIENT_FUNDS",
      message: "Not enough funds to complete the withdrawal",
      context,
    });
  }
}

class BankAccount extends DomainEntity<BankAccountState> {
  withdraw(amount: number): Result<void, InsufficientFunds> {
    if (this.state.balance < amount) {
      return err(
        new InsufficientFunds({
          available: this.state.balance,
          requested: amount,
        })
      );
    }

    this.state.balance -= amount;
    return ok();
  }
}
```

The caller is forced to handle both outcomes:

```typescript
const result = account.withdraw(500);

if (result.isErr()) {
  console.log("Failed:", result.error.message);
  console.log("Available:", result.error.context.available);
} else {
  console.log("Withdrawal successful");
}
```

Notice what this achieves:

- The withdrawal logic lives **in the entity**, not scattered in services
- The error is **typed** — you know exactly what can go wrong and what context it carries
- The caller **cannot ignore** the failure case (no silent exceptions)
- The entity remains in **valid state** — you never mutate the balance if the rule fails
- The failure is **meaningful to the domain** — `InsufficientFunds` is something a business person would recognize, not a technical artifact

This is domain logic done right: the entity is the single source of truth for what is allowed.

---

## Domain Events

A **Domain Event** is a record that something meaningful happened in your domain. Not a log line — a first-class object that says *"this happened, at this time, to this entity"*.

Domain events are useful for:
- **Reacting** to changes in other parts of the system (e.g. send an email when an account is opened)
- **Auditing** what happened over time
- **Event sourcing** — rebuilding state by replaying events

In `ontologic`, you define events by extending `DomainEvent`:

```typescript
import { DomainEvent } from "ontologic";

interface MoneyWithdrawnPayload {
  amount: number;
}

class MoneyWithdrawn extends DomainEvent<"MONEY_WITHDRAWN", 1, MoneyWithdrawnPayload> {
  constructor(entityId: string, payload: MoneyWithdrawnPayload) {
    super({ name: "MONEY_WITHDRAWN", version: 1, entityId, payload });
  }
}
```

Returning an event from a method is **optional** — not every state change needs to produce one. But it is highly recommended for any operation that has meaning outside the entity itself. If something happened that another part of the system might care about, make it explicit with an event rather than leaving observers to poll or infer.

When you do return events, your entity methods become the natural place to emit them:

```typescript
class BankAccount extends DomainEntity<BankAccountState> {
  withdraw(amount: number): Result<MoneyWithdrawn, InsufficientFunds> {
    if (this.state.balance < amount) {
      return err(new InsufficientFunds({ available: this.state.balance, requested: amount }));
    }

    this.state.balance -= amount;

    return ok(new MoneyWithdrawn(this.id(), { amount }));
  }
}
```

The caller receives the event and can do whatever the application needs — store it, dispatch it, log it:

```typescript
const result = account.withdraw(200);

if (result.isOk()) {
  const event = result.value;
  await eventStore.save(event);
  await messageBus.publish(event);
}
```

A few things worth noting about how `ontologic` models events:

- The **name** is a string literal type (`"MONEY_WITHDRAWN"`) — it's both a runtime value and a compile-time type
- The **version** is typed too, so you can handle different versions of the same event gracefully as your domain evolves
- The **payload** is deep-cloned on construction — nobody can mutate the event after it's created

---

## Putting It All Together

Here is a more complete example using the `CreditBalance` entity from the library's own examples. A credit balance tracks purchased credits and sub-credits for an organization:

```typescript
// 1. Define the state shape
interface CreditBalanceState {
  id: string;
  organizationId: string;
  subCreditBalance: number;
  lockedBalance: number;
  purchasedCreditBalance: number;
}

// 2. Define an invariant — balance must never go negative
const balanceIsPositive = new BaseDomainInvariant<CreditBalanceState>(
  "Balance Is Positive",
  (state) => state.subCreditBalance >= 0
);

// 3. Define events
class CreditBalanceDebited extends DomainEvent<"CREDIT_BALANCE_DEBITED", 1, { amount: number }> {
  constructor(entityId: string, payload: { amount: number }) {
    super({ name: "CREDIT_BALANCE_DEBITED", version: 1, entityId, payload });
  }
}

// 4. Define errors
class NotEnoughFunds extends DomainError<"NOT_ENOUGH_FUNDS", { available: number; amount: number }> {
  constructor(message: string, context: { available: number; amount: number }) {
    super({ name: "NOT_ENOUGH_FUNDS", message, context });
  }
}

// 5. Build the entity
class CreditBalance extends DomainEntity<CreditBalanceState> {
  constructor(id: string, state: CreditBalanceState) {
    super(id, state);
    this.addInvariant(balanceIsPositive); // attached here — always enforced
  }

  static create(params: { organizationId: string }) {
    const id = randomUUID();
    return new CreditBalance(id, {
      id,
      organizationId: params.organizationId,
      subCreditBalance: 0,
      lockedBalance: 0,
      purchasedCreditBalance: 0,
    });
  }

  debit(params: { amount: number }): Result<CreditBalanceDebited, NotEnoughFunds> {
    const { amount } = params;

    if (this.state.subCreditBalance < amount) {
      return err(new NotEnoughFunds("Not enough credits", {
        available: this.state.subCreditBalance,
        amount,
      }));
    }

    this.state.subCreditBalance -= amount;

    return ok(new CreditBalanceDebited(this.id(), { amount }));
  }

  available(): number {
    return this.state.subCreditBalance - this.state.lockedBalance;
  }
}

// 6. Use it
const balance = CreditBalance.create({ organizationId: "org-1" });

const result = balance.debit({ amount: 50 });

if (result.isErr()) {
  // Fully typed: result.error is NotEnoughFunds
  console.error(`Cannot debit: only ${result.error.context.available} available`);
} else {
  // Fully typed: result.value is CreditBalanceDebited
  await eventStore.save(result.value);
}
```

---

## Summary

| Concept | What it means | How `ontologic` helps |
|---|---|---|
| **State Encapsulation** | The entity controls its own data | `protected state`, deep-cloned `readState()` |
| **Invariants** | Rules that must always hold | `BaseDomainInvariant`, checked on read |
| **Domain Logic** | Behavior lives in the entity | Methods return `Result<Event, Error>` |
| **Domain Events** | Records of meaningful things that happened | Typed `DomainEvent` with name, version, payload |

DDD is ultimately about making your code reflect reality. When your `BankAccount` class knows what it means to be a bank account — what it can do, what it can't, what happens when it changes — you stop fighting the code and start thinking in your domain.

`ontologic` gives you the structure to do that without ceremony.
