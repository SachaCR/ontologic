# domain-entity

TypeScript building blocks for Domain-Driven Design. Provides base interfaces and an in-memory repository implementation for entities, domain events, and structured errors.

## Installation

```bash
pnpm add domain-entity
```

## Core concepts

### Entity

An entity is a domain object with a unique identity and a serializable state.

```typescript
import { Entity } from "domain-entity";

interface OrderState {
  id: string;
  customerId: string;
  total: number;
}

class Order implements Entity<OrderState> {
  #state: OrderState;

  private constructor(state: OrderState) {
    this.#state = state;
  }

  id(): string {
    return this.#state.id;
  }

  state(): OrderState {
    return { ...this.#state };
  }
}
```

**Interface:**

```typescript
interface Entity<State extends object> {
  id(): string;
  state(): State;
}
```

### DomainEvent

A record of something that happened to an entity.

```typescript
interface DomainEvent {
  name: string; // e.g. 'ORDER_PLACED'
  version: number; // schema version for the event payload
  entityId: string;
  payload: unknown;
}
```

Events are produced by entity methods and persisted alongside the entity via `saveWithEvents`.

### Repository

```typescript
interface Repository<T extends Entity<object>> {
  save(entity: T): Promise<Result<void, Error>>;
  saveWithEvents(
    entity: T,
    domainEvents: DomainEvent[],
  ): Promise<Result<void, Error>>;
  getById(id: string): Promise<Result<T, Error>>;
  list(params: {
    limit: number;
    offset: number;
  }): Promise<Result<{ limit: number; offset: number; data: T[] }, Error>>;
  getEvents(id: string): Promise<Result<DomainEvent[], Error>>;
}
```

All methods return a `Result` from [neverthrow](https://github.com/supermacro/neverthrow) — errors are values, no try/catch needed.

### InMemoryRepository

A `Repository` implementation that stores entities in memory. Useful for tests and prototyping.

```typescript
import { InMemoryRepository } from "domain-entity";

const repo = new InMemoryRepository<Order>();

// Save an entity
await repo.save(order);

// Save an entity with its domain events
await repo.saveWithEvents(order, [orderPlacedEvent]);

// Retrieve by id — returns err('Entity Not Found') if missing
const result = await repo.getById("order-123");
if (result.isOk()) {
  console.log(result.value.state());
}

// Paginated listing
const page = await repo.list({ limit: 10, offset: 0 });

// Retrieve accumulated events for an entity
const events = await repo.getEvents("order-123");
```

`saveWithEvents` accumulates events — calling it multiple times for the same entity appends to its event history.

### CustomError

A typed error class for classifying errors by category.

```typescript
import { CustomError } from "domain-entity";

type OrderErrorCode = "INSUFFICIENT_STOCK" | "ORDER_ALREADY_CANCELLED";

class OrderError extends CustomError<OrderErrorCode, { orderId: string }> {}

const error = new OrderError({
  name: "DOMAIN_ERROR",
  message: "Cannot cancel an already cancelled order",
  errorCode: "ORDER_ALREADY_CANCELLED",
  context: { orderId: "order-123" },
});

console.log(error.toString());
// [DOMAIN_ERROR ORDER_ALREADY_CANCELLED] Cannot cancel an already cancelled order
```

**Error names:**

| Name               | When to use                                                               |
| ------------------ | ------------------------------------------------------------------------- |
| `DOMAIN_ERROR`     | Expected failure in business logic (e.g. validation, invariant violation) |
| `TECHNICAL_ERROR`  | Infrastructure or I/O failure (e.g. DB connection, external API)          |
| `UNEXPECTED_ERROR` | Unhandled or truly unexpected condition                                   |

## Full example

```typescript
import { Entity, DomainEvent, InMemoryRepository } from "domain-entity";

interface CreditBalanceState {
  id: string;
  organizationId: string;
  balance: number;
}

class CreditBalance implements Entity<CreditBalanceState> {
  #id: string;
  #organizationId: string;
  #balance: number;

  private constructor(state: CreditBalanceState) {
    this.#id = state.id;
    this.#organizationId = state.organizationId;
    this.#balance = state.balance;
  }

  static init(params: { id: string; organizationId: string }): {
    entity: CreditBalance;
    event: DomainEvent;
  } {
    const state = {
      id: params.id,
      organizationId: params.organizationId,
      balance: 0,
    };
    return {
      entity: new CreditBalance(state),
      event: {
        name: "CREDIT_BALANCE_CREATED",
        version: 1,
        entityId: params.id,
        payload: state,
      },
    };
  }

  id() {
    return this.#id;
  }
  state() {
    return {
      id: this.#id,
      organizationId: this.#organizationId,
      balance: this.#balance,
    };
  }

  credit(amount: number): DomainEvent {
    this.#balance += amount;
    return {
      name: "CREDITED",
      version: 1,
      entityId: this.#id,
      payload: { amount },
    };
  }
}

const repo = new InMemoryRepository<CreditBalance>();

const { entity, event } = CreditBalance.init({
  id: "cb-1",
  organizationId: "org-1",
});
const creditEvent = entity.credit(500);

await repo.saveWithEvents(entity, [event, creditEvent]);

const events = (await repo.getEvents("cb-1"))._unsafeUnwrap();
console.log(events.map((e) => e.name)); // ['CREDIT_BALANCE_CREATED', 'CREDITED']
```

## Dependencies

- [neverthrow](https://github.com/supermacro/neverthrow) — result types for error handling without exceptions
