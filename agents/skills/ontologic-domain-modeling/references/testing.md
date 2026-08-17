# Testing domain code (vitest)

Always import explicitly: `import { describe, it, expect, beforeEach } from "vitest";`

## Entity tests — no repository, no mocks

Build state with a local helper and go through `fromState`:

```typescript
function makeSubscriptionState(
  overrides: Partial<SubscriptionState> = {},
): SubscriptionState {
  return {
    id: "sub-1",
    customerId: "cust-1",
    planId: "plan-basic",
    status: "PENDING",
    ...overrides,
  };
}

it("activates a pending subscription", () => {
  const subscription = Subscription.fromState("sub-1", makeSubscriptionState());

  const result = subscription.activate({ activatedAt: "2026-01-01T00:00:00.000Z" });

  expect(result.isOk()).toBe(true);
  expect(subscription.readState().status).toBe("ACTIVE");
});
```

## Asserting on a `Result`

Prefer the `isErr()` narrowing idiom over the unwrap helpers — it type-narrows, so
`result.error` is properly typed inside the block:

```typescript
const result = subscription.activate({ activatedAt: now });

expect(result.isErr()).toBe(true);
if (result.isErr()) {
  expect(result.error.name).toBe("INVALID_STATUS_TRANSITION");
  expect(result.error.context).toEqual({
    currentStatus: "ACTIVE",
    expectedStatus: "PENDING",
  });
}
```

`_unsafeUnwrap()` / `_unsafeUnwrapErr()` exist and are fine on a happy path where you
just want the value, but they throw on the wrong variant and give worse failure messages.
They are explicitly test-only — never ship them in application code.

## Asserting invariant violations

A violated invariant throws `CorruptedStateError` on **read**, not on mutation:

```typescript
it("rejects a subscription with no plan", () => {
  expect(() =>
    Subscription.fromState("sub-1", makeSubscriptionState({ planId: "" })),
  ).toThrow("Corrupted state detected");
});
```

The constructor also checks invariants, so a corrupted state fails at construction. For
structural assertions:

```typescript
try {
  Subscription.fromState("sub-1", makeSubscriptionState({ planId: "" }));
  expect.unreachable();
} catch (error) {
  expect(error).toBeInstanceOf(CorruptedStateError);
  expect((error as CorruptedStateError).violations).toEqual([
    { description: "Subscription Has A Plan" },
  ]);
}
```

`violations` collects **every** failing invariant, not just the first.

## Testing invariants standalone

Because invariants are module-level constants, test them without an entity:

```typescript
expect(
  subscriptionHasPlanInvariant.complyWith(makeSubscriptionState()).isCompliant,
).toBe(true);
```

## One `execute()` / one action per test

Drive the entity to its precondition with a small named setup helper, then perform
exactly one action in the test body and assert on it. Tests that chain several operations
and assert after each are hard to debug when they fail, because the failure does not tell
you which step broke.

```typescript
function setupActiveSubscription(): Subscription {
  const { subscription } = Subscription.create({
    customerId: "cust-1",
    planId: "plan-basic",
  });
  subscription.activate({ activatedAt: "2026-01-01T00:00:00.000Z" });
  return subscription;
}
```

## What to assert

For an entity, assert on one of three things and say which in the test name:

1. the returned `Result` (ok/err, and `error.name` on failures),
2. the resulting state via `readState()`,
3. the returned event's `name` and `payload`.

Note that `tsconfig` sets `noUncheckedIndexedAccess`, so `items[0]` is `T | undefined` —
tests need `?.` or a non-null assertion.
