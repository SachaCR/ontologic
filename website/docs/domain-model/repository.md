---
sidebar_position: 6
---

# Repository

In Domain-Driven Design, a **Repository** is the interface between your domain and your persistence layer. Its job is simple: store entities and retrieve them. Everything else — SQL queries, ORM mappings, connection pooling — is an implementation detail that your domain should never need to know about.

The domain speaks in entities. The repository translates.

---

## Why the domain shouldn't touch the database

If your entity methods contain database calls, two things happen:

1. Your domain logic becomes impossible to test without a real database
2. Your persistence concerns leak into your business rules, and the two become tangled over time

DDD keeps these concerns separate by design. The entity knows how to behave. The repository knows how to persist. Neither knows how the other works.

```typescript
// The entity has no idea where it's stored
class BankAccount extends DomainEntity<BankAccountState> {
  withdraw(amount: number): Result<MoneyWithdrawn, InsufficientFunds> {
    // Pure domain logic — no database, no I/O
  }
}

// The repository has no idea about domain rules
class BankAccountRepository {
  async getById(id: string): Promise<BankAccount> { ... }
  async save(account: BankAccount): Promise<void> { ... }
}
```

This separation keeps your domain logic fast, portable, and easy to reason about.

---

## Saving entities and events together

The most important responsibility of the repository in `ontologic` is saving entities and their domain events **atomically** — in a single transaction.

This matters because an entity state change and the event that records it are inseparable. If the entity is saved but the event is not, the rest of the system never learns what happened. If the event is saved but the entity is not, you have a record of something that technically didn't stick. Either way, your system is inconsistent.

`ontologic`'s repository solves this with `saveWithEvents`:

```typescript
const result = account.withdraw(200);

if (result.isOk()) {
  await repository.saveWithEvents(account, [result.value]);
}
```

Both the updated entity state and the event are written in a single database transaction. You get both, or neither. There is no in-between.

---

## The repository as a collection

A useful mental model: think of the repository as a collection that happens to be backed by a database.

You don't call `INSERT INTO accounts ...` — you call `repository.save(account)`. You don't call `SELECT * FROM accounts WHERE id = $1` — you call `repository.getById(id)`. The persistence mechanism is completely hidden behind a clean, domain-friendly interface.

`ontologic` gives you that interface as `Repository<Entity, Event>`. Every method returns a `Result` rather than throwing, so infrastructure failures are values you can inspect:

```typescript
interface Repository<Entity, Event> {
  save(entity: Entity): Promise<Result<void, Error>>;
  saveWithEvents(
    entity: Entity,
    domainEvents: DomainEventInterface | DomainEventInterface[],
  ): Promise<Result<void, Error>>;
  getById(id: string): Promise<Result<Entity | undefined, Error>>;
  list(params: { limit: number; offset: number }): Promise<
    Result<{ limit: number; offset: number; data: Entity[] }, Error>
  >;
  getEvents(
    entityId: string,
    options?: { limit: number; offset: number },
  ): Promise<Result<EventWithMetadata<Event>[], Error>>;
  getEventsAfter(
    entityId: string,
    eventId: string | undefined,
    limit?: number,
  ): Promise<Result<EventWithMetadata<Event>[], Error>>;
  onChanges(handler: (entityId: string) => void): void;
}
```

Note that a missing entity is `ok(undefined)`, not an error — "this order does not exist" is a domain decision for the caller to make, not an infrastructure failure.

This interface is what the domain and use cases depend on. The actual implementation — Postgres, SQLite, an in-memory store for tests — can be swapped without touching a single line of domain code.

---

## Testing with the built-in in-memory repository

`ontologic` ships with a generic `InMemoryRepository` that you can use directly — no need to write your own. It takes **two** type parameters: your entity, and the union of that entity's domain events. Pass your `fromState` factory to the constructor — that is how the repository rehydrates entities:

```typescript
import { InMemoryRepository } from 'ontologic';

class BankAccountRepository extends InMemoryRepository<
  BankAccount,
  BankAccountEvent
> {
  constructor() {
    super(BankAccount.fromState);
  }
}
```

That's it. The repository is ready to use in your tests and for rapid prototyping — remember that every method returns a `Result`:

```typescript
const repository = new BankAccountRepository();

// Save an entity and its events atomically
const result = account.withdraw(200);
if (result.isOk()) {
  await repository.saveWithEvents(account, result.value);
}

// Retrieve the entity — unwrap the Result, then check for undefined
const found = await repository.getById(account.id());
if (found.isOk() && found.value !== undefined) {
  console.log(found.value.readState());
}

// Inspect stored events
const events = await repository.getEvents(account.id());
```

Your tests become fast, deterministic, and free of infrastructure setup — without sacrificing any coverage of the domain logic. When you are ready to move to a real database, replace `InMemoryRepository` with your production implementation without touching a single line of domain code.

---

## Optimistic locking

Two requests can load the same entity at the same time, both make a valid decision, and both save — the second silently overwrites the first. Optimistic locking catches that.

Every `DomainEntity` carries a version:

```typescript
entity.version();          // the version the entity was loaded at; 0 when never persisted
entity.setVersion(n);      // called by the repository after a successful save
```

The contract is a division of labour:

- **The repository** reads `version()` to guard the write, and calls `setVersion()` afterwards so a second save of the same instance uses the up-to-date version.
- **Domain code never calls `setVersion()`.** Mutating the version outside a persistence boundary defeats the entire mechanism.

When the persisted version no longer matches, the repository returns a `ConcurrentWriteError` **inside a `Result`** — deliberately returned rather than thrown, so that retry sits in ordinary control flow:

```typescript
const saveResult = await repository.save(account);

if (saveResult.isErr() && saveResult.error.name === "CONCURRENT_WRITE") {
  // Somebody else committed first. Reload, re-apply, retry.
}
```

This is the opposite of [`CorruptedStateError`](./domain-entity.md), which signals a bug and is thrown. A concurrent write is not a bug — it is an expected outcome under load, and recoverable.

:::warning
`InMemoryRepository` does **not** implement optimistic locking. Versions stay at `0` and every `save()` succeeds. It is built for tests and prototyping, where there is no concurrency to guard against. Any production repository you write should implement the version check itself.
:::

A production implementation guards the write in SQL and only calls `setVersion` when a row actually came back:

```typescript
// UPDATE ... SET version = version + 1 WHERE id = $1 AND version = $2
// Zero rows returned means somebody else got there first.
if (rows.length === 0) {
  return err(
    new ConcurrentWriteError({
      entityId: entity.id(),
      expectedVersion: entity.version(),
    }),
  );
}

entity.setVersion(rows[0].version);
return ok(undefined);
```

---

## Summary

| Responsibility | Belongs to |
|---|---|
| Domain rules and behavior | Entity |
| Storing and retrieving entities | Repository |
| Atomic save of entity + events | `saveWithEvents` |
| Guarding against concurrent writes | Repository, via `version()` / `setVersion()` |
| Deciding what to do about a lost race | Caller, via `ConcurrentWriteError` |

The repository is the seam between your domain and the outside world. Keep it narrow, keep it clean, and your domain stays honest.
