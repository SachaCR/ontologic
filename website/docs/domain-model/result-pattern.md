---
sidebar_position: 4
---

# The Result Pattern

When an operation can fail, there are two common ways to communicate that failure to the caller: throw an exception, or return a value that represents the outcome.

Exceptions work well for unexpected, unrecoverable situations. But not all failures are unexpected. In a business domain, some failures are entirely normal — a withdrawal when the balance is too low, a reservation when the slot is already taken, a coupon code that has expired. These are not exceptional situations. They are valid branches of the business logic, and the caller should be expected to handle them.

The **Result pattern** makes this explicit. Instead of throwing, a method returns a `Result<Success, Failure>` — a value that is either a success (carrying the happy-path output) or an error (carrying the failure details). The caller is forced to decide what to do in both cases.

---

## The problem with exceptions for domain failures

Consider a withdrawal method that throws when funds are insufficient:

```typescript
class BankAccount {
  withdraw(amount: number): void {
    if (this.state.balance < amount) {
      throw new Error("Insufficient funds");
    }
    this.state.balance -= amount;
  }
}
```

The signature tells you nothing about what can go wrong. Nothing in TypeScript will remind you to handle the failure case. You might write:

```typescript
account.withdraw(500);
// Moved on — forgot this could throw
await repository.save(account);
```

And it works fine in tests, because the balance is always high enough. It fails in production, unhandled, at 2am.

The failure was predictable. The business knew about it. The code just didn't say so.

---

## Modelling the failure branch explicitly

With `ontologic`, you express this as a typed `Result`:

```typescript
import { Result, ok, err, DomainError } from "ontologic";

class InsufficientFunds extends DomainError<"INSUFFICIENT_FUNDS", { available: number; requested: number }> {
  constructor(context: { available: number; requested: number }) {
    super({
      name: "INSUFFICIENT_FUNDS",
      message: "Not enough funds to complete the withdrawal",
      context,
    });
  }
}

class BankAccount extends DomainEntity<BankAccountState> {
  withdraw(amount: number): Result<void, InsufficientFunds> {
    if (this.state.balance < amount) {
      return err(new InsufficientFunds({
        available: this.state.balance,
        requested: amount,
      }));
    }

    this.state.balance -= amount;
    return ok();
  }
}
```

Now the method signature is honest: it tells you that a withdrawal can fail with `InsufficientFunds`, and it forces you to deal with it:

```typescript
const result = account.withdraw(500);

if (result.isErr()) {
  console.log("Withdrawal failed:", result.error.message);
  console.log("Available:", result.error.context.available);
  return;
}

// Here, TypeScript knows the withdrawal succeeded
await repository.save(account);
```

You cannot ignore the error case. There is no way to accidentally skip it. The type system has your back.

---

## What makes a failure a domain failure?

Not every error belongs in a `Result`. The distinction is important.

A **domain failure** is a failure that has meaning in the business. It is a valid, expected outcome that a business person would recognize and could describe:

- "You can't withdraw more than your balance"
- "You can't book a slot that's already taken"
- "This coupon code has already been used"

These are not bugs. They are rules. They deserve to be modelled explicitly, with a name, a type, and context that tells the caller exactly what went wrong.

A **technical error** is something else entirely — a database connection timeout, a JSON parse failure, a network error. These are not part of your domain. They are infrastructure problems that the domain layer has no business knowing about. They should be thrown and caught at the application boundary, like any other unexpected exception.

Using `Result` for technical errors would pollute every call with error handling for things that aren't the domain's concern:

```typescript
// Don't do this — a database error is not a domain failure
withdraw(amount: number): Result<void, InsufficientFunds | DatabaseError | NetworkError> { ... }
```

The rule: if a business person would recognize it as a valid scenario, it's a domain failure — use `Result`. If it's infrastructure misbehaving, throw.

---

## Typed errors carry context

One of the key benefits of `DomainError` over a plain `Error` is that it carries **typed context**.

When `InsufficientFunds` is thrown as a plain exception, the caller gets a message string. They have to parse it to know the available balance. When it's a typed `DomainError`, the caller gets structured data:

```typescript
class InsufficientFunds extends DomainError<
  "INSUFFICIENT_FUNDS",
  { available: number; requested: number }
> { ... }

// The caller knows exactly what's there
result.error.context.available  // number
result.error.context.requested  // number
result.error.name               // "INSUFFICIENT_FUNDS"
result.error.message            // human-readable string
```

This makes error handling at the application layer clean and reliable, without any string parsing or casting.

---

## Summary

| | Exceptions | Result |
|---|---|---|
| **Use for** | Unexpected, unrecoverable failures | Expected, named domain failures |
| **Visibility** | Hidden from the signature | Explicit in the return type |
| **Handling** | Optional — easy to forget | Required — enforced by the type system |
| **Context** | A message string | Typed, structured data |

The Result pattern is not about avoiding exceptions. It is about being honest in your code about what can go wrong in your domain — and giving the caller the tools to respond to it meaningfully.

---

## A note on the implementation

The `Result` type in `ontologic` — `ok`, `err`, and the `Result<T, E>` type — is directly inspired by and largely copied from [neverthrow](https://github.com/supermacro/neverthrow), an excellent library by Gil Mizrahi.

It was vendored rather than listed as a dependency so that installing `ontologic` does not force a transitive dependency on your project. You get the same clean API without the version management overhead.

If you're already using `neverthrow` in your project, the two `Result` types are different implementations with the same shape — they won't conflict, but you shouldn't mix them in the same function signature.
