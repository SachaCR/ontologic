---
sidebar_position: 1
---

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

The `state` property is `protected` — only the entity and its subclasses can touch it. When you call `readState()`, you get back a **safe copy** — a deep clone by default — so there's no way for outside code to accidentally mutate the internal state. (When your state holds live sub-entities, you control how that copy is produced — see [Custom serialization](#custom-serialization-for-states-with-sub-entities).)

This is encapsulation in the DDD sense: **the entity controls all changes to itself**.

---

## Invariants

An **invariant** is a rule that must always be true about your entity. No matter what operation you perform, the entity should never end up in a state that violates it.

A classic invariant for a bank account: _the balance must never be negative_.

With `ontologic`, you express this as a `BaseDomainInvariant`:

```typescript
import { BaseDomainInvariant } from "ontologic";

const balanceIsPositive = new BaseDomainInvariant<BankAccountState>(
  "Balance must be positive",
  (state) => state.balance >= 0,
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

You can also pass them through the constructor's options, which enforces them from the very first moment:

```typescript
super(id, state, { invariants: [balanceIsPositive] });
```

:::warning Changed in 1.7.0
The constructor's third parameter used to be the invariant array itself:

```typescript
super(id, state, [balanceIsPositive]); // 1.6.x and earlier — no longer valid
```

It is now an options object, so that `serialize` could be added alongside `invariants`.
Upgrading from 1.6.x, the old form fails to compile with `TS2559: Type
'BaseDomainInvariant<State>[]' has no properties in common with type
'DomainEntityOptions<State, State>'`. The fix is to wrap it: `{ invariants: [...] }`, or
call `addInvariant(...)` in the constructor body.

The error is loud rather than silent, so a type-check after upgrading will find every
occurrence.
:::

From this point on, **every time the state is read**, the invariant is checked. If the state is ever found in violation, a `CorruptedStateError` is thrown immediately — before any corrupted data can propagate through the system.

```typescript
import { CorruptedStateError } from "ontologic";

const account = BankAccount.fromState("abc-123", {
  ownerId: "u1",
  balance: -50,
});

try {
  account.readState();
} catch (err) {
  if (err instanceof CorruptedStateError) {
    err.name; // "CORRUPTED_STATE"
    err.entityId; // "abc-123"
    err.state; // the offending state, for logging
    err.violations; // [{ description: "Balance must be positive" }]
  }
}
```

### `CorruptedStateError` is not a domain failure

The library treats corrupted state as a **programmer error**, not as a recoverable domain failure. The entity was constructed with valid state and something — a method, a hydration step, a hand-written migration — drove it into an invalid state. That is a bug. There is no safe way to "handle" it and continue manipulating the entity.

For that reason, `CorruptedStateError` extends `Error` directly and is **thrown**, not returned. Do not try to wrap it in a `Result`. The right reaction at the application boundary is:

1. Log every field on the error (`entityId`, `state`, `violations`).
2. Fail the current operation.
3. Page whoever owns the entity, because something in your code path is producing illegal state.

If you find yourself wanting to catch and recover from one, the underlying failure is probably a **domain failure** (something the business explicitly allows to fail) and deserves its own `DomainError` subtype returned inside a `Result`, not an invariant.

When several invariants fail at once, every failing description is collected into `err.violations`, so a single log line tells you all the rules the state broke — not just the first one the checker happened to hit.

Invariants also compose. You can combine them with logical operators:

```typescript
const balanceIsPositive = new BaseDomainInvariant<State>(
  "Balance is positive",
  (state) => state.balance >= 0,
);

const balanceIsReasonable = new BaseDomainInvariant<State>(
  "Balance is under limit",
  (state) => state.balance <= 1_000_000,
);

// Both must hold
const validBalance = balanceIsPositive.and(balanceIsReasonable);

// Logical operators available: .and() .or() .not() .xor() .andNot()
```

This lets you build complex business rules from simple, readable, named pieces.

---

## Reading state without paying for safety

`readState()` is safe by default: it runs the invariants and returns a **safe copy** — a deep clone unless you supply a custom [`serialize`](#custom-serialization-for-states-with-sub-entities). For most code paths, that's exactly what you want.

On hot paths, tight loops, large state objects, high-throughput services, the copy shows up in profiles. The entity exposes two opt-in accessors for those cases:

```typescript
account.readState(); // safe copy + invariant check  (default, safe)
account.unsafeReadState(); // no clone, but invariant check still runs
account.unsafeRawState(); // no clone, no check  (cheapest, fully on you)
```

- **`unsafeReadState(): Readonly<State>`**: returns the live internal state without cloning. The return type is `Readonly<State>`, which signals at the type level that you must not mutate it. Invariants still run, so a corrupted entity still throws `CorruptedStateError`. Use this when you only need to **read** the state and the clone cost is measurable.

- **`unsafeRawState(): State`**: returns the live internal state with no clone and no invariant check. The cheapest possible accessor and the most dangerous one. Reserve it for code that is provably read-only or that already holds an invariant proof by construction.

A practical rule:

- Default to `readState()`. It is the right choice 99% of the time.
- Reach for `unsafeReadState()` only after a profiler tells you the clone matters.
- Reach for `unsafeRawState()` only when you also need to skip the invariant check (for example, inside a serialization adapter where you've already validated the state upstream).

Both methods are deliberately named `unsafe*` so they are grep-able in code review.

---

## Custom serialization for states with sub-entities

By default, `readState()` produces its safe copy with `structuredClone`. That is exactly right when your state is plain, JSON-like data — the common case, and it needs no configuration.

But `structuredClone` **drops class prototypes**. If your state holds live instances — the sub-entities of an aggregate, value objects with behavior — cloning turns them back into plain objects and strips their methods:

```typescript
class OrderLine {
  constructor(
    private state: { sku: string; quantity: number; unitPrice: number },
  ) {}

  subtotal(): number {
    return this.state.quantity * this.state.unitPrice;
  }

  serialize() {
    return { ...this.state };
  }
}

const line = new OrderLine({ sku: "A", quantity: 2, unitPrice: 10 });
structuredClone(line).subtotal();
// 💥 TypeError: subtotal is not a function — the prototype is gone
```

To keep sub-entities alive inside an aggregate, give the entity a **`serialize`** function through the constructor's options. `readState()` calls it instead of `structuredClone`, and you decide how the rich internal state collapses into a plain, decoupled snapshot.

`DomainEntity` takes a second type parameter for this: `DomainEntity<State, Serialized>`. `State` is the rich internal form (holding live sub-entities); `Serialized` is the plain form `readState()` hands out.

```typescript
interface OrderState {
  lines: OrderLine[]; // live sub-entities, with domain logic
}

interface OrderSnapshot {
  lines: { sku: string; quantity: number; unitPrice: number }[]; // plain data
}

class Order extends DomainEntity<OrderState, OrderSnapshot> {
  constructor(id: string, state: OrderState) {
    super(id, state, {
      serialize: (state) => ({
        lines: state.lines.map((line) => line.serialize()),
      }),
    });
  }

  total(): number {
    // sub-entity logic stays usable internally
    return this.state.lines.reduce((sum, line) => sum + line.subtotal(), 0);
  }
}
```

The sub-entities keep their behavior inside the entity, while `readState()` still returns a plain, side-effect-free snapshot that outside code cannot use to reach back into the aggregate.

**When to provide `serialize`:**

- Your state contains **class instances** — sub-entities, value objects, anything with methods you still need after a read.
- **Not** for plain data. If your state is only objects, arrays, strings, numbers, dates, `Map`/`Set`, leave `serialize` out — the `structuredClone` default is correct and there's nothing to do.

Two things to keep in mind:

- **`serialize` is not persistence.** Its only job is to decouple the returned value from the entity's internals. How that snapshot is stored in a database or put on the wire is the [Repository](./repository.md)'s concern — and that's also where you rehydrate the sub-entities on the way back in.
- **The entity takes ownership of the state you pass it.** Because it cannot defensively clone on construction without stripping sub-entity prototypes, it keeps the exact object you hand to the constructor. Do not keep mutating that reference afterward.

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

class InsufficientFunds extends DomainError<
  "INSUFFICIENT_FUNDS",
  { available: number; requested: number }
> {
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
        }),
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

A **Domain Event** is a record that something meaningful happened in your domain. Not a log line — a first-class object that says _"this happened, at this time, to this entity"_.

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

class MoneyWithdrawn extends DomainEvent<
  "MONEY_WITHDRAWN",
  1,
  MoneyWithdrawnPayload
> {
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

The caller receives the event and can do whatever the application needs — store it, dispatch it, log it:

```typescript
const result = account.withdraw(200);

if (result.isOk()) {
  const event = result.value;
  await eventStore.save(event);
  await messageBus.publish(event);
}
```

### Events from use cases

Events don't always belong on the entity. Sometimes the entity simply doesn't have enough context to produce a meaningful event — that context only exists at the use case level.

Consider creating a new account and immediately crediting it in one operation. The entity knows how to create itself, and it knows how to apply a credit. But the fact that _"an account was opened with an initial deposit"_ is a higher-level business concept that neither operation alone can express. The use case has the full picture.

In that case, the use case itself is responsible for producing the event:

```typescript
class OpenAccountWithDepositUseCase
  implements UseCase<OpenAccountWithDepositCommand, AccountState, never>
{
  constructor(private readonly accounts: BankAccountRepository) {}

  async execute(command: OpenAccountWithDepositCommand) {
    const { ownerId, initialDeposit } = command.payload;
    const events: DomainEventInterface[] = [];

    const { account, creationEvent } = BankAccount.create({ ownerId });
    events.push(creationEvent);

    const depositEvent = account.deposit({ amount: initialDeposit });
    events.push(depositEvent);

    const saved = await this.accounts.saveWithEvents(account, events);

    if (saved.isErr()) {
      throw saved.error;
    }

    return ok(account.readState());
  }
}
```

See [Use Case](../application/use-case.md) for the full shape, including why the error side
is `never` here.

The rule of thumb: if the event can be produced with only the entity's internal state, let the entity produce it. If the event requires knowledge that only the use case has (other entities, input parameters, business context), produce it in the use case.

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
  (state) => state.subCreditBalance >= 0,
);

// 3. Define events
class CreditBalanceDebited extends DomainEvent<
  "CREDIT_BALANCE_DEBITED",
  1,
  { amount: number }
> {
  constructor(entityId: string, payload: { amount: number }) {
    super({ name: "CREDIT_BALANCE_DEBITED", version: 1, entityId, payload });
  }
}

// 4. Define errors
class NotEnoughFunds extends DomainError<
  "NOT_ENOUGH_FUNDS",
  { available: number; amount: number }
> {
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

  debit(params: {
    amount: number;
  }): Result<CreditBalanceDebited, NotEnoughFunds> {
    const { amount } = params;

    if (this.state.subCreditBalance < amount) {
      return err(
        new NotEnoughFunds("Not enough credits", {
          available: this.state.subCreditBalance,
          amount,
        }),
      );
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
  console.error(
    `Cannot debit: only ${result.error.context.available} available`,
  );
} else {
  // Fully typed: result.value is CreditBalanceDebited
  await eventStore.save(result.value);
}
```

---

## Summary

| Concept                 | What it means                              | How `ontologic` helps                           |
| ----------------------- | ------------------------------------------ | ----------------------------------------------- |
| **State Encapsulation** | The entity controls its own data           | `protected state`, safe-copy `readState()`      |
| **Custom serialization**| Keep sub-entities alive inside an aggregate| `serialize` option, `DomainEntity<State, Serialized>` |
| **Invariants**          | Rules that must always hold                | `BaseDomainInvariant`, checked on read          |
| **Domain Logic**        | Behavior lives in the entity               | Methods return `Result<Event, Error>`           |
| **Domain Events**       | Records of meaningful things that happened | Typed `DomainEvent` with name, version, payload |

DDD is ultimately about making your code reflect reality. When your `BankAccount` class knows what it means to be a bank account — what it can do, what it can't, what happens when it changes — you stop fighting the code and start thinking in your domain.

`ontologic` gives you the structure to do that without ceremony.
