# Modeling a domain with Ontologic — Part 2: Rules That Must Always Hold

This is the **second article in a hands-on series** about shaping a real-world problem into code using **[Ontologic](https://ontologic.site)**. Each article focuses on **one main idea** and points to the **[library-examples](https://github.com/SachaCR/ontologic/tree/main/packages/library-example)** repo so you can read, run, and change the code yourself.

**In this article** we pick up a sentence from article 1 that we passed over quickly: "Dates have to make sense on a loan." We turn that casual remark into **domain invariants** on the `Loan` entity and we explain why that matters more than it first appears.

---

## A date that does not make sense

Go back to the paper register for a moment. One morning a new volunteer fills in their first loan slip. They write the **due date one month before the loan date** a simple slip of the pen, `03` instead of `04`. The head librarian spots it immediately and corrects it before it goes in the drawer. Nobody wrote a policy called "due date must be after loan date." The librarian just knows that a loan where you owe the book back before you borrowed it **cannot be a valid loan**. It is not a rule that applies only in some situations; it is something that must be true for the record to describe a real event at all.

That is the intuition behind an **invariant**: a condition that must hold for a piece of state to be **coherent** — not just when the record is created, but at any point in its life.

---

## Invariants versus business rules

In article 1 we drew a rough boundary between two kinds of constraints:

- **Invariants** attach to a single entity. They express what it means for that entity to be internally consistent. They live on the entity itself.
- **Business rules** coordinate multiple entities or require checking external state. They live in **use cases**.

"A due date must be after the loan date" involves only the fields of one `Loan` record. No other entity, no external service, no database count. It is a statement about whether the **data inside one object makes sense**. That makes it an **invariant**.

"A member may not have more than three active loans" requires counting across the entire `LoanRegister`. That coordination means it lives in the **`registerLoan` use case**, not on the `Loan` entity itself.

The split keeps invariants **small and testable** and use cases focused on the interactions that genuinely need several moving parts.

---

## The `Loan` state and its lifecycle

Before we can talk about what must always be true, we need to know what the `Loan` entity remembers. The [`LoanState`](https://github.com/SachaCR/ontologic/blob/main/packages/library-example/src/domain/entities/loan/loan.entity.ts) interface holds exactly what a paper slip would hold:

```typescript
export interface LoanState {
  bookId: string;
  memberId: string;
  loanDate: string;
  dueDate: string;
  returnedAt: string | null;
}
```

A `Loan` starts with `returnedAt: null`. The only mutation in its lifetime is `returnBook(returnedAt)`, which records the return timestamp. Everything else the book, the member, the dates is set once at creation and never changes.

Even with that narrow lifecycle, two constraints on these dates should always hold.

---

## Two rules the librarian always knew

Written in plain language:

1. **The due date must fall after the loan date.** A loan that is already overdue before it starts describes nothing real.
2. **If a return date exists, it must not be before the loan date.** A book cannot come back before it left.

Notice the second rule has a special case baked in: when `returnedAt` is `null` (the loan is still open), there is nothing to check. The constraint only applies once the book comes back.

These are the two invariants we encode.

---

## Expressing invariants with `BaseDomainInvariant`

Ontologic provides `BaseDomainInvariant<State>`, a small class that takes:

- A **description** — a human-readable sentence naming the rule.
- A **predicate** — a function that receives the current state and returns `true` when the rule is satisfied.

Each invariant lives in its own file under `src/domain/entities/loan/invariants/`.

```typescript
// invariants/dueDateAfterLoanDate.invariant.ts
import { BaseDomainInvariant } from "ontologic";
import { LoanState } from "../loan.entity";

export const dueDateAfterLoanDate = new BaseDomainInvariant<LoanState>(
  "Due date must be after loan date",
  (state) => new Date(state.dueDate) > new Date(state.loanDate),
);
```

```typescript
// invariants/returnDateAfterLoanDate.invariant.ts
import { BaseDomainInvariant } from "ontologic";
import { LoanState } from "../loan.entity";

export const returnDateAfterLoanDate = new BaseDomainInvariant<LoanState>(
  "Return date must be after loan date",
  (state) =>
    state.returnedAt === null ||
    new Date(state.returnedAt) >= new Date(state.loanDate),
);
```

The predicate for `returnDateAfterLoanDate` illustrates something worth pausing on: the `null` case is part of the rule itself. The invariant does not say _"a return date always exists and must be sane"_; it says _"if a return date exists, it must be sane."_ The shape of the data and the shape of the rule match each other.

---

## Registering invariants on the entity

Invariants are registered by passing them to the `DomainEntity` **constructor** via the third argument of `super()`.

```typescript
import { DomainEntity } from "ontologic";
import { dueDateAfterLoanDate } from "./invariants/dueDateAfterLoanDate.invariant";
import { returnDateAfterLoanDate } from "./invariants/returnDateAfterLoanDate.invariant";

export class Loan extends DomainEntity<LoanState> {
  private constructor(id: string, state: LoanState) {
    super(id, state, [dueDateAfterLoanDate, returnDateAfterLoanDate]);
  }

  // ...
}
```

From this point on, the `Loan` entity carries its own list of invariants. Ontologic checks them automatically in two places:

- **At construction** — inside the `super()` call, before the entity is handed back to the caller.
- **On every `readState()`** — before returning a snapshot of the current state.

If any invariant returns `false`, Ontologic throws `"Corrupted state detected"` with the offending state as the cause. This is intentionally a hard failure: a state that violates an invariant is not a recoverable situation. It means something in the code constructed or mutated an entity incorrectly.

---

## These examples are simple — and that is fine

The two predicates above are short enough to read in a single glance. They are a fair example of what most entity-level invariants look like in practice: **self-contained checks over a handful of fields**, no I/O, no branching that needs its own tests.

That simplicity is not a limitation of the approach it is a sign that the design is working. When an invariant grows complex, it is often because it is trying to encode something that actually requires external state (and should be a business rule in a use case) or because the state shape could be cleaner.

The purpose here is not to impress with complexity but to **make implicit knowledge explicit**. The volunteer who made the date mistake would have gotten an immediate error if the digital system had been live. The invariant does not replace human review; it ensures that a class of mistake cannot silently enter the system.

---

## Wrapping up

We took one throwaway sentence from the first article "dates have to make sense on a loan" and turned it into two concrete invariants. Along the way we saw:

- The distinction between **invariants** (one entity, always true) and **business rules** (coordination across entities, in use cases).
- How `BaseDomainInvariant` encodes a description and a predicate against the entity's state.
- How registering invariants in `super()` makes Ontologic check them automatically at construction and at every `readState()`.
- Why hard failure on violation is the right response: corrupted state is a programmer error, not a user-facing outcome.

The examples here are deliberately minimal. Real domains sometimes have invariants that span several fields or involve computed values. The pattern stays the same; the predicates just grow.

---

## Where to see it in the repo

The invariants live in [`src/domain/entities/loan/invariants/`](https://github.com/SachaCR/ontologic/tree/main/packages/library-example/src/domain/entities/loan/invariants). The `Loan` entity that registers them is in [`src/domain/entities/loan/loan.entity.ts`](https://github.com/SachaCR/ontologic/blob/main/packages/library-example/src/domain/entities/loan/loan.entity.ts). The entity tests in [`src/domain/entities/loan/__tests__/loan.entity.test.ts`](https://github.com/SachaCR/ontologic/blob/main/packages/library-example/src/domain/entities/loan/__tests__/loan.entity.test.ts) exercise the lifecycle — creation, return, double-return — and implicitly rely on the invariants holding across each step.
