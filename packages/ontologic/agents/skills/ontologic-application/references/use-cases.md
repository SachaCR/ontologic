# Use case reference

`UseCase` is an interface in the library. A use case is a class in a
`<verbNoun>.use-case.ts` file, exporting `<VerbNoun>UseCase`, implementing it:

```typescript
export interface UseCase<
  Action extends ActionInterface,
  Output,
  Errors extends DomainError<string, unknown>,
> {
  execute(action: Action): Promise<Result<Output, Errors>>;
}
```

Three type arguments, and each one is a contract: what it is **asked** to do, what it
**produces**, and which domain failures a caller **must handle**.

## The action is a `Command` or a `Query`

The first type argument is never a loose object. It is a `Command` — an intent to change
something, which the domain may refuse — or a `Query` — a request to read, which cannot.
Both are declared exactly the way a `DomainEvent` is:

```typescript
// useCases/commands/subscribeToPlan.command.ts
export class SubscribeToPlanCommand extends Command<
  "SUBSCRIBE_TO_PLAN",
  { customerId: string; planId: string }
> {
  constructor(payload: { customerId: string; planId: string }) {
    super({ name: "SUBSCRIBE_TO_PLAN", payload });
  }
}

// useCases/queries/readSubscription.query.ts
export class ReadSubscriptionQuery extends Query<"READ_SUBSCRIPTION", { id: string }> {
  constructor(payload: { id: string }) {
    super({ name: "READ_SUBSCRIPTION", payload });
  }
}
```

Pick by what the use case does with its aggregates: if it calls `save` or `saveWithEvents`,
it is a command; if it only reads, it is a query. This is not documentation — the two
classes each hold private fields, so a `Query` is not assignable where a `Command` is
expected even when the payloads are identical.

Access the payload with `action.payload`, and destructure it once at the top of `execute`:
every read returns a fresh `structuredClone`, so repeated reads are repeated copies.

## Dependency injection

Constructor parameters, one per collaborator. Never instantiate a repository at module
scope — that makes the use case untestable and couples it to one implementation.

```typescript
// Good — scales to any number of collaborators
export class SubscribeToPlanUseCase
  implements UseCase<SubscribeToPlanCommand, SubscriptionState, SubscribeToPlanError>
{
  constructor(
    private readonly subscriptions: SubscriptionRepository,
    private readonly plans: PlanRepository,
  ) {}
}

// Avoid — untestable, single implementation forever
const repository = new SubscriptionRepository();
export class SubscribeToPlanUseCase { /* ... */ }
```

The constructor is also what keeps a cross-aggregate use case honest: the parameters say
which aggregates are in play, so a reviewer can see at a glance that `subscribeToPlan`
touches two. Read from as many as you need; **write to exactly one**.

Keep the class free of framework decorators. Wiring a use case into a DI container is the
composition root's job — register it with a factory there rather than putting
`@Injectable()` on a domain class.

## The return type is a contract

```typescript
Promise<Result<SubscriptionState, InvalidStatusTransition | EntityNotFound>>
```

The error side is an explicit **union of every domain failure the caller must handle**.
It is also **enforced**: `Errors` is constrained to `DomainError`, and `Error` does not
satisfy that constraint — it has no `context` property. `Result<T, Error>` will not
compile. A use case with no domain failure mode declares `never`:

```typescript
export class AddBookUseCase implements UseCase<AddBookCommand, BookState, never> {
```

Add to the union when you add a failure mode.

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

const saveResult = await this.subscriptions.saveWithEvents(subscription, domainEvents);
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
