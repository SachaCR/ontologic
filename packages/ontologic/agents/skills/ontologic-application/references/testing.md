# Testing use cases (vitest)

Use a **real** `InMemoryRepository` subclass, not a mock. It stores `entity.readState()`
and the events, so it exercises the same invariant checks and serialization path as
production — with none of the setup.

Tests live in `__tests__/` beside the use case. Titles follow the same Gherkin structure
as domain tests: `describe` carries **Given** and **When** as full sentences, every `it`
starts with **Then** and states the outcome in the domain's language.

```typescript
import { describe, it, expect, beforeEach } from "vitest";

describe("Given a customer with a pending subscription", () => {
  let subscriptions: SubscriptionRepository;
  let activateSubscription: ActivateSubscriptionUseCase;
  let subscriptionId: string;

  beforeEach(async () => {
    subscriptions = new SubscriptionRepository();
    activateSubscription = new ActivateSubscriptionUseCase(subscriptions);
    subscriptionId = await openPendingSubscription(subscriptions);
  });

  describe("When the subscription is activated", () => {
    let outcome: Awaited<ReturnType<ActivateSubscriptionUseCase["execute"]>>;

    beforeEach(async () => {
      outcome = await activateSubscription.execute(
        new ActivateSubscriptionCommand({
          id: subscriptionId,
          activatedAt: "2026-01-01T00:00:00.000Z",
        }),
      );
    });

    it("Then the subscription becomes active", () => {
      expect(outcome.isOk()).toBe(true);
      if (outcome.isOk()) {
        expect(outcome.value.status).toBe("ACTIVE");
      }
    });
  });
});
```

`Awaited<ReturnType<SomeUseCase["execute"]>>` is the idiom for typing the captured outcome
without restating the `Result` union.

Build the use case in the same `beforeEach` that builds its repositories, and give the
variable the use case's own name — the **When** block then reads as
`await activateSubscription.execute(new ActivateSubscriptionCommand({ ... }))`.

## Reaching the precondition

Compose the earlier use cases in a named setup helper rather than reaching into the
repository by hand. The helper doubles as documentation of how the state is legitimately
reached, and returns the id:

```typescript
async function openPendingSubscription(
  subscriptions: SubscriptionRepository,
  overrides: Partial<{ customerId: string; planId: string }> = {},
): Promise<string> {
  const fields = { customerId: "cust-1", planId: "plan-basic", ...overrides };
  const { subscription, creationEvent } = Subscription.create(fields);

  const saved = await subscriptions.saveWithEvents(subscription, creationEvent);
  if (saved.isErr()) throw saved.error;

  return subscription.id();
}
```

Put shared helpers in `__tests__/helpers.ts`. Give each scenario distinct identifying
values so cases cannot collide.

**Assert your setup actually worked** when a Given has several steps — a guard assertion
inside `beforeEach` turns a confusing Then failure into an obvious setup failure:

```typescript
beforeEach(async () => {
  const subscribeToPlan = new SubscribeToPlanUseCase(subscriptions, planRepo);

  for (const planId of plans) {
    const r = await subscribeToPlan.execute(
      new SubscribeToPlanCommand({ customerId, planId }),
    );
    expect(r.isOk()).toBe(true);
  }
});
```

## One call per test

The **When** block calls the use case **once**. Everything else goes in the **Given**.

Use cases and workflows cache and memoize; a test that calls `execute` repeatedly and
asserts between calls relies on state carried across invocations, and when it fails you
cannot tell which call broke it. Seed the earlier state in the **Given** instead.

## The four things worth asserting

Pick the one that matches what the scenario is about, and say so in the Then:

```typescript
// 1. The returned Result
it("Then the customer is told the subscription is active", () => { ... });

// 2. The persisted state
it("Then the subscription is stored as active", async () => {
  const stored = (await subscriptions.getById(id))._unsafeUnwrap();
  expect(stored?.readState().status).toBe("ACTIVE");
});

// 3. The emitted events
it("Then the activation is recorded in the subscription's history", async () => {
  const events = (await subscriptions.getEvents(id))._unsafeUnwrap();
  expect(events.map((e) => e.event.name)).toEqual([
    "SUBSCRIPTION_CREATED",
    "SUBSCRIPTION_ACTIVATED",
  ]);
});

// 4. The refusal
it("Then the subscription refuses a second activation", () => {
  expect(outcome.isErr()).toBe(true);
  if (outcome.isErr()) {
    expect(outcome.error.name).toBe("INVALID_STATUS_TRANSITION");
  }
});
```

Asserting the **event sequence** is the highest-value use-case test — it is the part the
rest of the system depends on, and the part most easily broken by a refactor.

## Testing a cross-aggregate rule

A rule living in a use case is tested through the use case, with both repositories real:

```typescript
describe("Given a plan that is no longer offered", () => {
  describe("When a customer tries to subscribe to it", () => {
    it("Then the subscription is refused", () => {
      expect(outcome.isErr()).toBe(true);
      if (outcome.isErr()) {
        expect(outcome.error.name).toBe("PLAN_NO_LONGER_OFFERED");
      }
    });

    it("Then no subscription is recorded for the customer", async () => {
      const stored = (await subscriptions.list({ limit: 10, offset: 0 }))._unsafeUnwrap();
      expect(stored.data).toHaveLength(0);
    });
  });
});
```

The second Then is the one worth writing: a refusal that still wrote something is the
failure mode that matters.

## Notes

- `getEvents` returns `EventWithMetadata<Event>[]`, so reach through `.event` — the
  metadata (`id`, `createdAt`, optional `offset`) sits alongside it.
- `_unsafeUnwrap()` is acceptable in tests and throws on the wrong variant. For assertions
  about failures, prefer the `isErr()` narrowing idiom so `result.error` types correctly.
- `InMemoryRepository` does not implement optimistic locking, so it cannot be used to test
  `ConcurrentWriteError` handling. That needs a repository that actually versions rows.
- Test the event bus with `InMemoryConnectors`, which pairs a publisher and listener over
  a single emitter.
- A use case declared with `never` on the error side cannot be tested for a domain failure
  — there is none. Assert its state and events instead.
