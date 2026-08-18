# Entity reference

## The two factories

Every aggregate gets exactly two entry points, and they are not interchangeable.

`create(params)` mints a brand-new entity. It generates the id, builds the creation event,
and returns **both** — the caller needs the event to pass to `saveWithEvents`:

```typescript
static create(params: { customerId: string; planId: string }): {
  subscription: Subscription;
  creationEvent: SubscriptionCreated;
} {
  const id = randomUUID();

  const creationEvent = new SubscriptionCreated(id, {
    customerId: params.customerId,
    planId: params.planId,
    status: "PENDING",
  });

  // Spread the event payload so state and event can never disagree.
  const subscription = new Subscription(id, { id, ...creationEvent.payload });

  return { subscription, creationEvent };
}
```

`fromState(id, state)` rehydrates a persisted entity. It emits no event — loading is not
a domain fact. This is the function you hand to the repository constructor.

Both funnel through the same private constructor, which is where invariants are attached
so they hold on both paths.

## Reading state

```typescript
entity.readState();        // invariant check + safe copy   ← the default
entity.unsafeReadState();  // invariant check, no copy      (Readonly<State>)
entity.unsafeRawState();   // no check, no copy             (cheapest, fully on you)
```

`readState()` deep-clones (via `structuredClone`) so a caller cannot reach back through
the returned object and mutate the entity. `Readonly<State>` from `unsafeReadState()` is
shallow and erased at runtime — it is a signal, not a guarantee.

Reach for the unsafe variants only when a profiler says the clone matters. Use
`unsafeRawState()` only when you also need to skip the invariant check, e.g. inside a
serialization adapter that already validated upstream.

## Aggregates holding sub-entities

`structuredClone` strips class prototypes, so an entity whose state holds live
sub-entities cannot use the default. Supply a `serialize` function and a second type
parameter:

```typescript
interface CartState { lines: OrderLine[] }           // live instances
interface CartSnapshot { lines: OrderLineState[] }   // plain data

class Cart extends DomainEntity<CartState, CartSnapshot> {
  private constructor(id: string, state: CartState) {
    super(id, state, {
      serialize: (s) => ({ lines: s.lines.map((line) => line.readState()) }),
    });
  }

  static fromSnapshot(id: string, snapshot: CartSnapshot): Cart {
    return new Cart(id, { lines: snapshot.lines.map(OrderLine.fromState) });
  }

  total(): number {
    return this.state.lines.reduce((sum, line) => sum + line.subtotal(), 0);
  }
}
```

Three consequences worth knowing:

- When you pass `serialize`, the entity **takes ownership of the state reference without
  cloning on ingest** — cloning would strip the prototypes it is trying to preserve. Do
  not keep mutating the object you passed in.
- When `Serialized` differs from `State`, `serialize` is **mandatory**; the
  `structuredClone` default cannot produce it.
- `serialize` is **not persistence**. Its only job is decoupling the returned value.
  Storage and rehydration stay the repository's concern — that is what `fromSnapshot` is
  for, and it is why `Repository<Entity, Event>` types its mapper against
  `ReturnType<Entity["readState"]>`.

## Optimistic locking

`version()` returns the version the entity was loaded at (`0` when never persisted).
Repositories read it to guard the write and call `setVersion(n)` after a successful save.
**Domain code never calls `setVersion`** — mutating the version outside a persistence
boundary defeats the mechanism. See the `ontologic-application` skill.

## Options object vs `addInvariant`

Both work:

```typescript
super(id, state, { invariants: [subscriptionHasPlanInvariant] });
// or
super(id, state);
this.addInvariant(subscriptionHasPlanInvariant);
```

The examples in the library use `addInvariant` in the constructor. Prefer the options
form for value objects, where there is no id and construction is the only entry point.
