# Events and errors reference

## Domain events

```typescript
export interface SubscriptionActivatedPayload {
  status: "ACTIVE";
  activatedAt: string;
}

export class SubscriptionActivated extends DomainEvent<
  "SUBSCRIPTION_ACTIVATED",  // name — literal type
  1,                          // version — literal number
  SubscriptionActivatedPayload
> {
  constructor(entityId: string, payload: SubscriptionActivatedPayload) {
    super({ name: "SUBSCRIPTION_ACTIVATED", version: 1, entityId, payload });
  }
}
```

Conventions:

- **Past tense, `SCREAMING_SNAKE_CASE`.** Events are facts about what happened, not
  commands about what should happen. `ORDER_PAID`, not `PAY_ORDER`.
- **One event per file**, named `<eventName>.event.ts`.
- **The version is part of the type.** Bump it when the payload shape changes, and keep
  the old class around if old events are still in the store.
- The payload is `structuredClone`d on both write and read, so an event is effectively
  immutable once constructed.
- `toJSON()` gives `{ entityId, name, version, payload }` — that is what goes on the wire.

### The union file is not optional

```typescript
// events/subscriptionEvents.ts
export type SubscriptionEvent = SubscriptionCreated | SubscriptionActivated;
```

This union is the second type parameter of `Repository` / `InMemoryRepository`, and it is
what makes `listener.listenTo("SUBSCRIPTION_ACTIVATED", handler)` narrow the handler's
payload to the right type via `Extract<Event, { name: EventName }>`.

**Adding an event class without adding it to the union is the single most common
omission.** The code compiles; the listener just never types the new event.

### Not every state change is an event

Emit an event when something the *rest of the system* might care about happened. An
internal recalculation that nobody subscribes to does not need one.

## Domain errors

```typescript
const NAME = "INVALID_STATUS_TRANSITION";

interface InvalidStatusTransitionContext {
  currentStatus: string;
  expectedStatus: string;
}

export class InvalidStatusTransition extends DomainError<
  typeof NAME,
  InvalidStatusTransitionContext
> {
  constructor(message: string, context: InvalidStatusTransitionContext) {
    super({ message, name: NAME, context });

    Object.setPrototypeOf(this, InvalidStatusTransition.prototype);
  }
}
```

### Why `Object.setPrototypeOf` is mandatory

`DomainError`'s own constructor ends with `Object.setPrototypeOf(this, DomainError.prototype)`.
That call clobbers your subclass's prototype. Without the re-set in your constructor:

```typescript
const e = new InvalidStatusTransition("...", ctx);

e instanceof InvalidStatusTransition; // false  ← silently wrong
e instanceof DomainError;             // true   ← so the bug hides
e.name === "INVALID_STATUS_TRANSITION"; // true ← and name-based checks still work
```

Because the discriminated-union style used everywhere else switches on `name`, the broken
prototype often goes unnoticed until something does a narrow `instanceof` check. Always
include the line, as the last statement of the constructor.

### Why `const NAME` rather than an inline literal

`typeof NAME` gives the literal string type, which makes `name` a usable discriminant:

```typescript
switch (result.error.name) {
  case "INVALID_STATUS_TRANSITION":
    return err(result.error);
  default:
    switchGuard(result.error.name);  // compile error if a case is missing
}
```

An inline string in the `super()` call would widen to `string` and the exhaustiveness
check would stop working.

### Context, not string interpolation

Put the structured data in `context`, not baked into the message. The message is for
humans; `context` is what upstream code, logs, and metrics can actually use.

## The error hierarchy at a glance

| Class | Thrown or returned? | Meaning |
|---|---|---|
| Your `DomainError` subclasses | Returned in a `Result` | The business said no |
| `CorruptedStateError` | Thrown | An invariant is violated — this is a bug |
| `ConcurrentWriteError` | Returned in a `Result` | Lost an optimistic-locking race; retry |
| Plain `Error` | Thrown | Infrastructure failure |
