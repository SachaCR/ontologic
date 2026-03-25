---
sidebar_position: 5
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
  async findById(id: string): Promise<BankAccount> { ... }
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

You don't call `INSERT INTO accounts ...` — you call `repository.save(account)`. You don't call `SELECT * FROM accounts WHERE id = $1` — you call `repository.findById(id)`. The persistence mechanism is completely hidden behind a clean, domain-friendly interface.

```typescript
interface BankAccountRepository {
  findById(id: string): Promise<BankAccount | null>;
  save(account: BankAccount): Promise<void>;
  saveWithEvents(account: BankAccount, events: DomainEvent[]): Promise<void>;
}
```

This interface is what the domain and use cases depend on. The actual implementation — Postgres, SQLite, an in-memory store for tests — can be swapped without touching a single line of domain code.

---

## Testing with an in-memory repository

Because your use cases depend on the repository *interface*, not a specific implementation, you can swap in an in-memory version for tests:

```typescript
class InMemoryBankAccountRepository implements BankAccountRepository {
  private store = new Map<string, BankAccount>();
  private events: DomainEvent[] = [];

  async findById(id: string): Promise<BankAccount | null> {
    return this.store.get(id) ?? null;
  }

  async save(account: BankAccount): Promise<void> {
    this.store.set(account.id(), account);
  }

  async saveWithEvents(account: BankAccount, events: DomainEvent[]): Promise<void> {
    this.store.set(account.id(), account);
    this.events.push(...events);
  }
}
```

Your tests become fast, deterministic, and free of infrastructure setup — without sacrificing any coverage of the domain logic.

---

## Summary

| Responsibility | Belongs to |
|---|---|
| Domain rules and behavior | Entity |
| Storing and retrieving entities | Repository |
| Atomic save of entity + events | `saveWithEvents` |

The repository is the seam between your domain and the outside world. Keep it narrow, keep it clean, and your domain stays honest.
