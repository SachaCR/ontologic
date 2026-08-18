---
name: ontologic-application
description: Write application-layer code with the `ontologic` library — use cases that load and save entities through a repository, repository implementations including optimistic locking, event bus publishers and listeners, and the outbox message relay. Use when wiring domain models to persistence or messaging, or when working with files matching *.use-case.ts or *.repository.ts.
---

# Ontologic — application layer

The seam between domain models and the outside world: use cases, repositories, the event
bus, and the outbox relay.

## The rule that decides every branch

**Technical failures are thrown. Domain failures are returned.**

Repository methods return `Result<T, Error>` because infrastructure can fail. A use case
unwraps that and **throws** — a dead database is not a business outcome. But a missing
entity comes back as `ok(undefined)`, and whether "missing" is an error is a *domain*
decision, so it is returned as `err(new EntityNotFound(...))`.

## Use case shape

A use case is a **class implementing `UseCase<Action, Output, Errors>`**. Its dependencies
are constructor parameters. The canonical sequence:

```typescript
export class ActivateSubscriptionUseCase
  implements UseCase<
    ActivateSubscriptionCommand,
    SubscriptionState,
    InvalidStatusTransition | EntityNotFound
  >
{
  constructor(private readonly subscriptions: SubscriptionRepository) {}

  async execute(
    command: ActivateSubscriptionCommand,
  ): Promise<Result<SubscriptionState, InvalidStatusTransition | EntityNotFound>> {
    const { id, activatedAt } = command.payload;

    const resultGetById = await this.subscriptions.getById(id);
    if (resultGetById.isErr()) throw resultGetById.error;       // technical → throw

    const subscription = resultGetById.value;
    if (subscription === undefined) {                          // domain → return
      return err(new EntityNotFound("Does not exist", { entityId: id }));
    }

    const result = subscription.activate({ activatedAt });
    if (result.isErr()) {
      switch (result.error.name) {
        case "INVALID_STATUS_TRANSITION":
          return err(result.error);
        default:
          switchGuard(result.error.name);                      // exhaustiveness
      }
    }

    const saveResult = await this.subscriptions.saveWithEvents(
      subscription,
      result.value,
    );
    if (saveResult.isErr()) throw saveResult.error;

    return ok(subscription.readState());                        // state, not the entity
  }
}
```

Constructor injection is what lets a use case span two aggregates — one parameter per
repository it touches.

When a use case produces several events, collect them in an array and hand the array to
`saveWithEvents`.

## The action: `Command` or `Query`

A use case never takes a loose input object. It takes an **action**, and the action says
whether this is an intent to change something or a request to read:

```typescript
export class ActivateSubscriptionCommand extends Command<
  "ACTIVATE_SUBSCRIPTION",
  { id: string; activatedAt: string }
> {
  constructor(payload: { id: string; activatedAt: string }) {
    super({ name: "ACTIVATE_SUBSCRIPTION", payload });
  }
}

export class ReadSubscriptionQuery extends Query<
  "READ_SUBSCRIPTION",
  { id: string }
> {
  constructor(payload: { id: string }) {
    super({ name: "READ_SUBSCRIPTION", payload });
  }
}
```

Both mirror `DomainEvent`: a literal name bound once in the subclass, a cloned payload.
Use a **`Command`** when the use case writes, a **`Query`** when it only reads. The two are
not interchangeable — each holds private fields, so a `Query` is never assignable where a
`Command` is expected, even when the payloads match.

Commands live in `useCases/commands/`, queries in `useCases/queries/`, beside
`useCases/errors/`.

## The error side cannot be widened

`Errors` is constrained to `DomainError`, so `Result<T, Error>` **does not compile** —
`DomainError` declares a `context` property that `Error` lacks. Declare the union of every
domain failure the caller must handle, or `never` when the use case has no domain failure
mode:

```typescript
implements UseCase<AddBookCommand, BookState, never>              // cannot fail
implements UseCase<RegisterLoanCommand, LoanState, BookNotFound | BookAlreadyOnLoan>
```

A widened error union throws away the exhaustiveness checking that makes `switchGuard`
useful, and leaves callers unable to see what they must handle.

## Which rules belong here

A rule belongs in a use case when it **cannot be decided from one entity's state alone** —
it needs another aggregate, a count, or a lookup. Rules that only read one entity's own
fields belong on the entity, as an invariant or a guard clause.

Structure a use case to **read from as many aggregates as it needs and write to exactly
one**: `saveWithEvents(entity, events)` is the only atomic unit, and there is no
cross-aggregate transaction. See `references/where-logic-goes.md` in the
`ontologic-domain-modeling` skill for the full decision table.

## Repository finders

A predicate that names a domain concept — "active means `returnedAt === null`" — belongs
on the repository as a finder, not repeated in each use case:

```typescript
export class LoanRegister extends InMemoryRepository<Loan, LoanEvent> {
  constructor() {
    super(Loan.fromState);
  }

  async findActiveLoansForMember(memberId: string): Promise<Result<Loan[], Error>> {
    const loans: Loan[] = [];

    for (const [id, state] of this.store) {
      if (state.memberId === memberId && state.returnedAt === null) {
        loans.push(Loan.fromState(id, state));
      }
    }

    return ok(loans);
  }
}
```

Filter over raw state, rehydrate through `Entity.fromState(id, state)`, return a `Result`.
The use case then reads as business language rather than as a filter expression.

## Repository

`Repository<Entity, Event>` is an interface, not a base class. For tests and prototyping
extend the built-in — it takes **two** type parameters:

```typescript
export class SubscriptionRepository extends InMemoryRepository<
  Subscription,
  SubscriptionEvent
> {
  constructor() {
    super(Subscription.fromState);
  }
}
```

Optimistic locking: `entity.version()` is the version the entity was loaded at (`0` when
never persisted). A production repository guards the write on it, returns
`ConcurrentWriteError` inside a `Result` when it disagrees, and calls `entity.setVersion(n)`
after a successful save. **Domain code never calls `setVersion`.**
`InMemoryRepository` does not implement locking at all.

## Copy-ready templates

`../ontologic-templates/templates/src/domain/useCases/activateSubscription.use-case.ts`,
`.../readSubscription.use-case.ts` (the query shape),
`.../commands/activateSubscription.command.ts` and
`../ontologic-templates/templates/src/domain/subscription.repository.ts` — all type-checked in CI.

## Traps

- `InMemoryRepository<Subscription>` is wrong; it needs the event union as the second
  parameter.
- Returning the entity from a use case instead of `entity.readState()`.
- Declaring `Result<T, Error>` on a use case — it does not compile. Name the domain errors,
  or use `never`.
- Reaching for a `Command` when the use case only reads. If nothing is saved, it is a
  `Query`.
- Reading `command.payload` repeatedly in a hot path — every read is a `structuredClone`.
  Destructure it once at the top of `execute`.
- A `switch` on `error.name` without `default: switchGuard(...)` — that default is what
  makes the switch exhaustive at compile time.
- `Result` has only `ok`, `err`, `isOk()`, `isErr()`, `.value`, `.error`. There is no
  `map`, `andThen`, `match`, or `unwrapOr`.
- `_unsafeUnwrap()` / `_unsafeUnwrapErr()` are test-only and throw on the wrong variant.
- The event bus **listener** requires a `validator` — events arrive as plain JSON and
  are not instances of your event classes without one.

## Deeper references

In this skill:

- `references/use-cases.md` — dependency injection, error unions, multi-event use cases, the throw-or-return table
- `references/testing.md` — vitest patterns for use cases

In the `ontologic-domain-modeling` skill:

- `references/where-logic-goes.md` — the entity-vs-use-case decision table, with a worked cross-aggregate example

On the docs site:

- Repository and optimistic locking — <https://ontologic.site/docs/domain-model/repository>
- Event bus: publisher, listener, connectors, validators — <https://ontologic.site/docs/event-bus/event-bus>
- Message relay and the outbox pattern — <https://ontologic.site/docs/event-bus/message-relay>
- Everything in one file — <https://ontologic.site/llms-full.txt>
