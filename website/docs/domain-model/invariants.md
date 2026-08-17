---
sidebar_position: 4
---

# Invariants

An **invariant** is a rule that must always be true about your entity — no matter what.

Not "usually true". Not "true after most operations". Always. If an invariant is violated, the entity is in a corrupted state and nothing should be trusted about it.

A bank account balance must never be negative. An order cannot have zero line items. A user must always have at least one role. These are invariants: non-negotiable truths about your domain objects.

---

## The problem without invariants

Without explicit invariants, rules get scattered. The balance check might live in the `withdraw` method, but what stops someone from directly setting the balance through some other path? What happens when you load an entity from the database and the data is already invalid due to a past bug?

```typescript
// A bug six months ago wrote a negative balance to the database.
// You load it, it looks fine, you operate on it, you make things worse.
const account = BankAccount.fromState("abc-123", { ownerId: "u1", balance: -200 });
account.deposit(100); // Now it's -100. Still wrong. Nobody noticed.
```

The entity had no way to reject the corrupted state on entry. The invariant was only checked at one specific point in the code — not at the boundary of the entity itself.

---

## Expressing invariants with `ontologic`

In `ontologic`, you define an invariant as a `BaseDomainInvariant` — a named predicate over your entity's state:

```typescript
import { BaseDomainInvariant } from "ontologic";

interface BankAccountState {
  balance: number;
}

const balanceIsPositive = new BaseDomainInvariant<BankAccountState>(
  "Balance must be positive",
  (state) => state.balance >= 0
);
```

You attach it to your entity in the constructor:

```typescript
class BankAccount extends DomainEntity<BankAccountState> {
  constructor(id: string, state: BankAccountState) {
    super(id, state);
    this.addInvariant(balanceIsPositive);
  }
}
```

From this point on, **every time the state is read**, the invariant is checked. If it is violated, an error is thrown immediately — before any corrupted data can propagate further through the system.

```typescript
// This is caught at the boundary, before anything else runs
const account = BankAccount.fromState("abc-123", { ownerId: "u1", balance: -200 });
account.readState(); // throws: "Corrupted state detected — Balance must be positive"
```

The entity becomes its own gatekeeper. You no longer need to remember to check preconditions everywhere — the entity checks itself.

---

## Invariants are not the same as validation

It's worth drawing a clear line between invariants and input validation.

**Input validation** happens at the boundary of your system — when data arrives from outside (a form submission, an API request). It rejects malformed input before it enters the domain. Validation is about format and shape: "is this a valid email address?", "is this number in the expected range?".

**Invariants** operate inside the domain. They express rules about the *internal consistency* of your model. They are not about user input — they are about what it means for an entity to be in a valid state at all.

A user might submit a withdrawal amount that is perfectly valid input (a positive number, correctly formatted) but that would violate a domain invariant (the resulting balance would be negative). Input validation passes. The domain invariant prevents the operation.

---

## Composing invariants

Simple invariants can be combined into more expressive rules using logical operators:

```typescript
const balanceIsPositive = new BaseDomainInvariant<BankAccountState>(
  "Balance is positive",
  (state) => state.balance >= 0
);

const balanceIsUnderLimit = new BaseDomainInvariant<BankAccountState>(
  "Balance is under limit",
  (state) => state.balance <= 1_000_000
);

// Both must hold
const balanceIsValid = balanceIsPositive.and(balanceIsUnderLimit);
```

Available operators:

| Operator | Meaning |
|---|---|
| `.and(other)` | Both invariants must hold |
| `.or(other)` | At least one must hold |
| `.not()` | The invariant must not hold |
| `.xor(other)` | Exactly one must hold |
| `.andNot(other)` | This must hold and the other must not |

This lets you build complex business rules out of small, named, testable pieces — and give each piece a name that communicates its intent.

---

## Where to define invariants

Invariants should be defined close to the state they describe, and attached to the entity in the constructor. This ensures they are enforced for every instance of the entity, whether it was just created or just loaded from the database.

```typescript
// Defined at module level — reusable, named, testable
const balanceIsPositive = new BaseDomainInvariant<BankAccountState>(
  "Balance is positive",
  (state) => state.balance >= 0
);

class BankAccount extends DomainEntity<BankAccountState> {
  constructor(id: string, state: BankAccountState) {
    super(id, state);
    this.addInvariant(balanceIsPositive); // enforced for every instance
  }
}
```

Defining them at module level also makes them easy to unit test independently of the entity:

```typescript
expect(balanceIsPositive.complyWith({ balance: 100 }).isCompliant).toBe(true);
expect(balanceIsPositive.complyWith({ balance: -1 }).isCompliant).toBe(false);
```

`complyWith(state)` returns an `InvariantCheckResult` — `{ isCompliant: boolean; description: string; operator?: string }` — rather than a bare boolean. The `description` is the name you gave the invariant, and it is what `CorruptedStateError` reports when the rule is violated.

---

## Summary

Invariants are the domain's immune system. They don't just prevent bad operations — they reject bad state on entry, catching corrupted data the moment it is loaded, before it can do any damage.

When you encode your business rules as invariants rather than scattering checks across methods and services, you get an entity that is self-defending: one that cannot be put into an invalid state, regardless of how it is used.
