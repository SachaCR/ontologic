# Testing domain code (vitest)

Always import explicitly: `import { describe, it, expect, beforeEach } from "vitest";`

Tests live in a `__tests__/` folder beside the code under test, named `*.test.ts`, and
import the subject with a relative path (`../subscription.entity`).

## Gherkin structure

Test titles are written as **scenarios in the domain's language**, not as descriptions of
methods:

- **`describe`** carries **Given** and **When** only. Each title is the keyword plus a
  full sentence, in one string.
- **`it`** is always a **Then**. The title starts with `Then` and states the outcome in
  ubiquitous language — what the business observes, not what the code returns.
- Never wrap Then branches in their own `describe`.

```typescript
describe("Given a customer has chosen a plan", () => {
  describe("When they open a new subscription", () => {
    let subscription: Subscription;
    let creationEvent: SubscriptionCreated;

    beforeEach(() => {
      const created = Subscription.create({
        customerId: "cust-1",
        planId: "plan-basic",
      });
      subscription = created.subscription;
      creationEvent = created.creationEvent;
    });

    it("Then the subscription is waiting to be activated", () => {
      expect(subscription.readState().status).toBe("PENDING");
    });

    it("Then a subscription-created event records the customer and the plan", () => {
      expect(creationEvent.name).toBe("SUBSCRIPTION_CREATED");
      expect(creationEvent.version).toBe(1);
      expect(creationEvent.entityId).toBe(subscription.id());
      expect(creationEvent.payload).toEqual({
        customerId: "cust-1",
        planId: "plan-basic",
        status: "PENDING",
      });
    });
  });
});
```

Prefer the librarian/customer/operator's words over the API's. `"Then the subscription is
waiting to be activated"` beats `"Then status equals PENDING"`; `"Then the library refuses
the loan"` beats `"Then it returns an Err"`.

An `it` groups the assertions that belong to **one outcome statement** — asserting an
event's `name`, `version`, `entityId` and `payload` together is one Then, not four.

## Entity tests use no repository and no mocks

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
```

## Asserting on a `Result`

Prefer the `isErr()` narrowing idiom over the unwrap helpers — it type-narrows, so
`result.error` is properly typed inside the block. This is a TypeScript requirement, not
defensiveness: `result.error` does not compile otherwise.

```typescript
describe("Given a subscription that is already active", () => {
  describe("When the customer tries to activate it again", () => {
    let outcome: ReturnType<Subscription["activate"]>;

    beforeEach(() => {
      const subscription = Subscription.fromState(
        "sub-1",
        makeSubscriptionState({ status: "ACTIVE" }),
      );
      outcome = subscription.activate({ activatedAt: "2026-01-01T00:00:00.000Z" });
    });

    it("Then the subscription refuses the second activation", () => {
      expect(outcome.isErr()).toBe(true);
      if (outcome.isErr()) {
        expect(outcome.error.name).toBe("INVALID_STATUS_TRANSITION");
        expect(outcome.error.context).toEqual({
          currentStatus: "ACTIVE",
          expectedStatus: "PENDING",
        });
      }
    });
  });
});
```

`_unsafeUnwrap()` / `_unsafeUnwrapErr()` are fine on a happy path where you just want the
value, but they throw on the wrong variant and give worse failure messages. They are
explicitly test-only — never ship them in application code.

## Asserting invariant violations

A violated invariant throws `CorruptedStateError`. Invariants run in the constructor and
on every `readState()`, so a corrupted state fails as soon as it is built:

```typescript
describe("Given a subscription record with no plan", () => {
  describe("When it is loaded from storage", () => {
    it("Then the subscription is rejected as corrupted", () => {
      expect(() =>
        Subscription.fromState("sub-1", makeSubscriptionState({ planId: "" })),
      ).toThrow("Corrupted state detected");
    });
  });
});
```

For structural assertions, catch and inspect — `violations` collects **every** failing
invariant, not just the first:

```typescript
expect(error).toBeInstanceOf(CorruptedStateError);
expect((error as CorruptedStateError).violations).toEqual([
  { description: "Subscription Has A Plan" },
]);
```

## Testing invariants standalone

Because invariants are module-level constants, test them without an entity:

```typescript
expect(
  subscriptionHasPlanInvariant.complyWith(makeSubscriptionState()).isCompliant,
).toBe(true);
```

## One action per test

The **When** block performs the action, in a `beforeEach` that runs once per Then. The
**Given** block holds shared setup. Keep exactly one action in the When, and drive the
entity to its precondition in the Given.

Tests that chain several operations and assert between them are hard to debug, because
the failure does not tell you which step broke.

## Notes

- `tsconfig` sets `noUncheckedIndexedAccess`, so `items[0]` is `T | undefined` — tests
  need `?.` or a non-null assertion.
- If an entity method reads the clock internally, its tests need `vi.useFakeTimers()` and
  `vi.setSystemTime()`, with `vi.useRealTimers()` in `afterEach`. That friction is the
  argument for passing timestamps in as parameters instead — see
  `references/where-logic-goes.md`.
