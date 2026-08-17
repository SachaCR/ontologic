# Testing use cases (vitest)

Use a **real** `InMemoryRepository` subclass, not a mock. It stores `entity.readState()`
and the events, so it exercises the same invariant checks and the same serialization path
as production — with none of the setup.

```typescript
import { describe, it, expect, beforeEach } from "vitest";

describe("activateSubscriptionUseCase", () => {
  let repository: SubscriptionRepository;

  beforeEach(() => {
    repository = new SubscriptionRepository(); // fresh instance per test
  });

  it("activates a pending subscription", async () => {
    const id = await setupPendingSubscription(repository);

    const result = await activateSubscriptionUseCase(repository, id, NOW);

    expect(result._unsafeUnwrap().status).toBe("ACTIVE");
  });
});
```

## Reaching the precondition

Compose the earlier use cases in a named setup helper rather than reaching into the
repository by hand. The helper doubles as documentation of how the state is legitimately
reached:

```typescript
async function setupPendingSubscription(
  repository: SubscriptionRepository,
): Promise<string> {
  const created = await createSubscriptionUseCase(repository, "cust-1", "plan-basic");
  return created._unsafeUnwrap().id;
}
```

## One call per test

Each test calls the use case **once** and asserts on that call. Seed everything else in
the setup helper.

Use cases and workflows cache and memoize; a test that calls the same function repeatedly
and asserts between calls is relying on state carried across invocations, and when it
fails you cannot tell which call broke it. Put the prior calls in setup, keep one in the
body.

## The four things worth asserting

Pick the one that matches what the test is about:

```typescript
// 1. The returned Result
expect(result._unsafeUnwrap().status).toBe("ACTIVE");

// 2. The persisted state
const stored = (await repository.getById(id))._unsafeUnwrap();
expect(stored?.readState().status).toBe("ACTIVE");

// 3. The emitted events
const events = (await repository.getEvents(id))._unsafeUnwrap();
expect(events.map((e) => e.event.name)).toEqual([
  "SUBSCRIPTION_CREATED",
  "SUBSCRIPTION_ACTIVATED",
]);

// 4. The failure
expect(result.isErr()).toBe(true);
if (result.isErr()) {
  expect(result.error.name).toBe("INVALID_STATUS_TRANSITION");
}
```

Asserting the **event sequence** is the highest-value use-case test — it is the part the
rest of the system depends on and the part most easily broken by a refactor.

## Notes

- `getEvents` returns `EventWithMetadata<Event>[]`, so reach through `.event` — the
  metadata (`id`, `createdAt`, optional `offset`) sits alongside it.
- `_unsafeUnwrap()` is acceptable in tests and throws on the wrong variant. In assertions
  about failures, prefer the `isErr()` narrowing idiom so `result.error` types correctly.
- `InMemoryRepository` does not implement optimistic locking, so it cannot be used to test
  `ConcurrentWriteError` handling. That needs a repository that actually versions rows.
- Test the event bus with `InMemoryConnectors`, which pairs a publisher and listener over
  a single emitter.
