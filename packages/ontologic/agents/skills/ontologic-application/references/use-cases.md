# Use case reference

There is no `UseCase` class or interface in the library. A use case is a convention:
an exported async function in a `<verbNoun>.use-case.ts` file, exporting `<verbNoun>UseCase`,
taking the caller's **input** first and a named **dependencies** bag second.

## Dependency injection

Two parameters, both objects: what the caller is asking for, and what the use case needs
to do it. Never instantiate a repository at module scope — that makes the use case
untestable and couples it to one implementation.

```typescript
// Good — scales to any number of collaborators
export async function subscribeToPlanUseCase(
  input: { customerId: string; planId: string },
  dependencies: { subscriptions: SubscriptionRepository; plans: PlanRepository },
) { /* ... */ }

// Avoid — a second aggregate has nowhere to go, and positional args get ambiguous
export async function subscribeToPlanUseCase(
  repository: SubscriptionRepository,
  customerId: string,
  planId: string,
) { /* ... */ }

// Avoid — untestable, single implementation forever
const repository = new SubscriptionRepository();
export async function subscribeToPlanUseCase(customerId: string) { /* ... */ }
```

Destructure both at the top of the body, so the rest of the function reads the same as a
positional one:

```typescript
const { customerId, planId } = input;
const { subscriptions, plans } = dependencies;
```

The bag is also what keeps a cross-aggregate use case honest: the names say which
aggregates are in play, so a reviewer can see at a glance that `subscribeToPlan` touches
two. Read from as many as you need; **write to exactly one**.

## The return type is a contract

```typescript
Promise<Result<SubscriptionState, InvalidStatusTransition | EntityNotFound>>
```

The error side is an explicit **union of every domain failure the caller must handle**.
Widening it to `DomainError` or `Error` throws away the exhaustiveness checking that
makes `switchGuard` useful. Add to the union when you add a failure mode.

The success side is the **state**, not the entity. Handing an entity to a controller lets
the transport layer call domain methods.

## Handling entity errors exhaustively

```typescript
const result = subscription.activate({ activatedAt });

if (result.isErr()) {
  switch (result.error.name) {
    case "INVALID_STATUS_TRANSITION":
      return err(result.error);

    default:
      switchGuard(result.error.name);
  }
}

// TypeScript knows result is Ok here.
const event = result.value;
```

`switchGuard(value: never)` is the exhaustiveness helper. If the entity method later gains
a new error type and you do not add a `case`, `result.error.name` stops being `never` in
the `default` branch and the build fails. That is the entire point — do not replace it
with `throw new Error("unreachable")`.

Note the control flow: after the `if (result.isErr())` block, every branch has either
returned or hit `switchGuard` (which returns `never`), so TypeScript narrows `result` to
`Ok` and `result.value` is safe.

## Multiple events

Accumulate and pass the array — `saveWithEvents` takes one event or many, and writes them
with the entity state in a single transaction:

```typescript
const domainEvents: SubscriptionEvent[] = [];

const { subscription, creationEvent } = Subscription.create({ customerId, planId });
domainEvents.push(creationEvent);

const activated = subscription.activate({ activatedAt });
if (activated.isErr()) {
  switch (activated.error.name) {
    case "INVALID_STATUS_TRANSITION":
      return err(activated.error);
    default:
      switchGuard(activated.error.name);
  }
}
domainEvents.push(activated.value);

const saveResult = await subscriptions.saveWithEvents(subscription, domainEvents);
if (saveResult.isErr()) throw saveResult.error;
```

Atomicity is the reason to batch: the state change and the events that record it must land
together or not at all.

## Where use-case-level errors live

Failures that belong to the use case rather than the entity — `EntityNotFound` is the
canonical one — go in `useCases/errors/`, not in the aggregate's `errors/` folder. The
entity has no opinion about lookup failures; it was never asked.

## Throw or return? — a worked table

| Line | Outcome | Why |
|---|---|---|
| `repository.getById` returns `Err` | **throw** | The database failed. Not a business outcome |
| `repository.getById` returns `ok(undefined)` | **return `err`** | Whether absence is an error is a domain decision |
| `entity.activate()` returns `Err` | **return `err`** | The business said no |
| `repository.saveWithEvents` returns `Err` | **throw** | Infrastructure again |
| Save returns `ConcurrentWriteError` | **retry or return** | Recoverable — reload, re-apply, try again |
| `readState()` throws `CorruptedStateError` | **let it propagate** | It is a bug. Do not wrap it in a `Result` |
