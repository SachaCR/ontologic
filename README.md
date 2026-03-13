# domain-entity

Interfaces and base types to implement **Domain Entities** and **Domain Events** in TypeScript. Includes a generic **in-memory repository** so you can prototype and test without a persistence layer. The repository interface can be implemented for any database or storage engine by the consumer of the library.

## Installation

```bash
pnpm add domain-entity
```

## What this library provides

- **Domain Entity** — Base class and types for entities with identity and serializable state.
- **Domain Events** — Interfaces and a typed event class for recording what happened to an entity.
- **Repository interface** — Contract for saving/loading entities and their events (implementation-agnostic).
- **In-memory repository** — A `Repository` implementation that stores state and events in memory, useful for prototyping and tests. You can implement the same interface for PostgreSQL, MongoDB, or any other backend.

All repository methods return a `Result` from [neverthrow](https://github.com/supermacro/neverthrow) — errors are values, no try/catch required.

## Domain Entity

An entity has a unique identity and a serializable state. Extend `DomainEntity<State>` and expose a way to reconstruct from state (e.g. `fromState`) for the repository.

```typescript
import { DomainEntity } from "domain-entity";

interface OrderState {
  id: string;
  customerId: string;
  total: number;
}

class Order extends DomainEntity<OrderState> {
  private constructor(id: string, state: OrderState) {
    super(id, state);
  }

  static fromState(id: string, state: OrderState): Order {
    return new Order(id, state);
  }
}
```

- **`id()`** — Entity identity.
- **`readState()`** — Copy of the current state (used by the repository to persist).

## Domain Events

Events represent something that happened to an entity. Use the **`IDomainEvent`** interface or the **`DomainEvent`** class for typed name, version, and payload.

```typescript
import { IDomainEvent, DomainEvent } from "domain-entity";

// Plain interface
const e: IDomainEvent = {
  name: "ORDER_PLACED",
  version: 1,
  entityId: "order-1",
  payload: { total: 99 },
};

// Typed class
class OrderPlaced extends DomainEvent<"ORDER_PLACED", 1, { total: number }> {
  constructor(entityId: string, payload: { total: number }) {
    super({ entityId, name: "ORDER_PLACED", version: 1, payload });
  }
}
```

Events are typically produced by entity methods and stored alongside the entity via `saveWithEvents`.

## Repository

The **`Repository<State, Entity>`** interface defines the persistence contract. You can implement it for any storage (SQL, NoSQL, etc.).

```typescript
import type { Repository } from "domain-entity";

// Implement this interface for your database
interface Repository<State, Entity extends DomainEntity<State>> {
  save(entity: Entity): Promise<Result<void, Error>>;
  saveWithEvents(entity: Entity, domainEvents: IDomainEvent[]): Promise<Result<void, Error>>;
  getById(id: string): Promise<Result<Entity | undefined, Error>>;
  list(params: { limit: number; offset: number }): Promise<Result<{ limit: number; offset: number; data: Entity[] }, Error>>;
  getEvents(id: string, options?: { limit: number; offset: number }): Promise<Result<IDomainEvent[], Error>>;
}
```

- **`getById`** returns `ok(undefined)` when the entity is not found (no exception). Your use cases can map that to a domain error like `EntityNotFound` if needed.
- **`getEvents`** supports optional pagination (`limit`, `offset`).

## In-memory repository

**`InMemoryRepository<State, Entity>`** is a generic implementation of `Repository` that keeps state and events in memory. Use it to prototype or test without setting up a database. When you are ready, implement the same `Repository` interface for your chosen engine.

Construction requires a **mapper** that rebuilds the entity from its id and state (e.g. your `fromState` factory):

```typescript
import { InMemoryRepository } from "domain-entity";

const repo = new InMemoryRepository<OrderState, Order>(Order.fromState);

await repo.save(order);
await repo.saveWithEvents(order, [orderPlacedEvent]);

const result = await repo.getById("order-123");
if (result.isOk() && result.value !== undefined) {
  console.log(result.value.readState());
}

const page = await repo.list({ limit: 10, offset: 0 });
const events = await repo.getEvents("order-123", { limit: 100, offset: 0 });
```

`saveWithEvents` appends events to the entity’s event history on each call.

## CustomError

A base class for typed domain or technical errors (category, code, context):

```typescript
import { CustomError } from "domain-entity";

class OrderError extends CustomError<"ALREADY_CANCELLED", { orderId: string }> {
  constructor(orderId: string) {
    super({
      name: "DOMAIN_ERROR",
      message: "Order already cancelled",
      errorCode: "ALREADY_CANCELLED",
      context: { orderId },
    });
  }
}
```

## Full example

A complete example (entity, events, repository, use cases) is in the **`examples`** directory of this repository: a credit balance aggregate with creation, credit, debit, and error handling, using the in-memory repository. You can use it as a template and swap in your own `Repository` implementation when you add persistence.

## Dependencies

- [neverthrow](https://github.com/supermacro/neverthrow) — `Result` type for error handling without exceptions
