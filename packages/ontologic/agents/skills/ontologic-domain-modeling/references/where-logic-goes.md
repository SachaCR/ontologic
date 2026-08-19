# Where business logic goes

The hardest decision when modelling with Ontologic is not *how* to write an entity — it
is deciding whether a given rule belongs on the entity or in the use case. This is the
rule that settles it:

> **Invariants attach to a single entity.** They express what it means for that entity to
> be internally consistent, and they live on the entity itself.
>
> **Business rules coordinate multiple entities or require checking external state.**
> They live in use cases.

"A due date must be after the loan date" involves only the fields of one loan record. No
other entity, no query, no count. That is an **invariant**.

"A member may not have more than three active loans" requires counting across every loan
in the system. That coordination makes it a **business rule**, and it belongs in the use
case that registers a loan.

---

## Decision table

| The rule… | Lives in | Because |
|---|---|---|
| Constrains fields of one entity's own state | **Invariant** on that entity | Answerable from `this.state` alone |
| Is a state-machine guard on one entity ("already paid") | **Entity method**, returning `err(...)` | Same — it only reads its own state |
| Needs another aggregate's state | **Use case** | An entity holds another aggregate's *id*, never a reference to it |
| Needs a count, or a query across many rows | **Use case** | It requires the repository, and entities never do I/O |
| Is "does this entity exist?" | **Use case**, after `getById` returns `ok(undefined)` | Absence is a domain decision, not a repository one |
| Is a reusable query predicate ("active means `returnedAt === null`") | **Repository** finder | Keeps the predicate in one place; the use case stays readable |
| Is input format validation ("is this a valid ISBN?") | **The system boundary**, above the use case | Not a domain concern — see below |

### The tie-breaker

When you are unsure, ask: **can this rule be decided from `this.state` alone?**

- Yes → it belongs on the entity, as an invariant (always true) or a guard clause in a
  behavior method (true at this transition).
- No → it belongs in the use case, because deciding it requires something the entity
  cannot reach.

---

## A worked cross-aggregate use case

Registering a loan has four rules. Notice that only one of them is on an entity:

```typescript
export class RegisterLoanUseCase
  implements UseCase<RegisterLoanCommand, LoanState, RegisterLoanError>
{
  // One constructor parameter per aggregate this use case touches.
  constructor(
    private readonly libraryCollection: LibraryCollection,
    private readonly loanRegister: LoanRegister,
  ) {}

  async execute(
    command: RegisterLoanCommand,
  ): Promise<Result<LoanState, RegisterLoanError>> {
    const { bookId, memberId } = command.payload;

    const bookLookup = await this.libraryCollection.getById(bookId);
    if (bookLookup.isErr()) throw bookLookup.error;        // infrastructure → throw

    const book = bookLookup.value;

    // RULE 1 — existence. Needs a lookup, so: use case.
    if (book === undefined) {
      return err(new BookNotFound("This book does not exist", { bookId }));
    }

    // RULE 2 — a lost book cannot be lent. Reads ANOTHER aggregate's state, so: use case.
    // Note the Book is read-only here; it is a fact source, not something we mutate.
    if (book.readState().lost) {
      return err(new BookLostCannotBeLoaned("...", { bookId }));
    }

    // RULE 3 — one active loan per copy. Needs a query, so: use case.
    const outstanding = await this.loanRegister.findOutstandingLoanForBook(bookId);
    if (outstanding.isErr()) throw outstanding.error;
    if (outstanding.value !== undefined) {
      return err(new BookAlreadyOnLoan("...", { bookId }));
    }

    // RULE 4 — at most three active loans. Needs a COUNT, so: use case.
    const active = await this.loanRegister.findActiveLoansForMember(memberId);
    if (active.isErr()) throw active.error;
    if (active.value.length >= MAX_ACTIVE_LOANS_PER_MEMBER) {
      return err(new MemberActiveLoanLimitExceeded("...", { memberId }));
    }

    // The entity enforces its OWN rules — that the dates cohere — via its invariants.
    const { loan, creationEvent } = Loan.create({ bookId, memberId });

    const saveResult = await this.loanRegister.saveWithEvents(loan, creationEvent);
    if (saveResult.isErr()) throw saveResult.error;

    return ok(loan.readState());
  }
}
```

`RegisterLoanCommand` is a `Command`, not a plain object — this use case writes. A use case
that only reads is declared over a `Query` instead, and that choice is the type-level
record of whether the operation changes anything.

The `Loan` entity knows nothing about books being lost or members having limits. It holds
`bookId: string` and `memberId: string` — ids, not references — and its only rules are
that a due date follows a loan date and a return date does not precede one.

---

## Read many aggregates, write one

`saveWithEvents(entity, events)` is the only atomic unit Ontologic gives you. There is no
cross-aggregate transaction, no unit of work.

So structure a use case to **read from as many aggregates as it needs, and write to
exactly one**. The example above loads a `Book` purely as a fact source and never mutates
or saves it; the only write is the new `Loan`.

If you genuinely need to change two aggregates together, that is a signal — either the
boundary is drawn in the wrong place and they are really one aggregate, or the second
change should be driven by a domain event after the fact.

---

## Who does what

**IDs are generated by the entity**, inside `static create`, with `randomUUID()`. Not by
the use case, not by the repository, not by the caller. Creation is where identity comes
into existence, and `create` is the only place that knows it.

**Time is passed in, not read inside the entity.** Prefer:

```typescript
// Use case reads the clock…
const returnedAt = new Date().toISOString();
const result = loan.returnBook(returnedAt);

// …the entity just records it.
returnBook(returnedAt: string): Result<LoanReturned, LoanAlreadyReturned> { ... }
```

over an entity method that calls `new Date()` itself. The reason is testability: a method
that takes the timestamp is tested with a plain string literal, while one that reads the
clock forces every test through `vi.useFakeTimers()` and `vi.setSystemTime()`. An entity
that depends on the clock depends on the outside world, which is the thing entities are
supposed to avoid.

**Events are normally constructed by the entity and returned inside the `Result`.** The use
case takes what the entity handed back and passes it to `saveWithEvents`. Publishing is not
its job either — the repository persists events alongside state, and the message relay
forwards them.

**But a use case may construct an event when the entity cannot know it happened.** Some
events only exist in a context the aggregate has no business holding.

A bank account knows how to open itself and how to take a credit, so it emits
`ACCOUNT_CREATED` and `ACCOUNT_CREDITED` from its own state. Now add a referral programme:
opening an account through a referral grants a bonus, and the business wants
`REFERRAL_BONUS_GRANTED` tracked. The `Account` entity has no idea a referral exists — the
use case does.

```typescript
const { account, creationEvent } = Account.create({ ownerId });
const creditEvent = account.credit({ amount: REFERRAL_BONUS });

// Only this use case knows the credit was a referral bonus.
const bonusEvent = new ReferralBonusGranted(account.id(), {
  referrerId,
  amount: REFERRAL_BONUS,
});

await accounts.saveWithEvents(account, [creationEvent, creditEvent, bonusEvent]);
```

You could instead put `account.applyReferralBonus(referrerId)` on the entity, and sometimes
that is the better model. The test is whether the aggregate should know the concept at all:
if teaching it the rule means teaching it a context it has no business holding, the event
belongs to the use case.

The default stays entity-produced — an event derivable from the aggregate's own state
belongs on the aggregate. This is the exception, not a second equal option.

**Entities never do I/O.** No repository, no HTTP, no logger, no clock. If a rule needs
any of those, that is the signal it belongs in a use case.

**A use case returns state, never the entity.** `ok(entity.readState())`, or
`ok({ id: entity.id(), ...entity.readState() })` when the caller needs the identity.
Returning the entity lets the transport layer call domain methods.

---

## Validation is three different things

Do not let these collapse into one another:

| Kind | Question | Where |
|---|---|---|
| **Input validation** | Is this a well-formed ISBN / email / positive number? | The system boundary — controller, DTO, schema. Above the use case entirely |
| **Business rules** | Is this operation allowed *right now*, given the rest of the system? | Use case |
| **Invariants** | Is this entity's state internally coherent, always? | Entity |

An amount can be perfectly valid input (a positive, well-formatted number) and still
violate a business rule (it exceeds the balance). Input validation passing tells you
nothing about whether the domain will accept the operation.

---

## Errors follow the same seam

Because the rules split that way, the errors do too:

- **Entity errors** are answerable from `this.state` alone — `LoanAlreadyReturned`,
  `InvalidStatusTransition`. Defined under the aggregate's `errors/` folder and returned
  by the entity method.
- **Use-case errors** require a lookup or a count — `EntityNotFound`,
  `MemberActiveLoanLimitExceeded`. Defined under `useCases/errors/`.

One subtlety worth knowing: an error can be *named after* one aggregate but *raised by*
another aggregate's use case. "This book cannot be loaned because it is lost" is about a
`Book`, but it is raised while registering a `Loan`. File it with the aggregate the error
is *about*, and let the use case import it.

---

## Rules that end up in the repository

A predicate that defines a domain concept — "active means `returnedAt === null`",
"outstanding means no return date for this book" — is best expressed once as a repository
finder rather than repeated in each use case:

```typescript
export class LoanRegister extends InMemoryRepository<Loan, LoanEvent> {
  constructor() {
    super(Loan.fromState);
  }

  async findActiveLoansForMember(memberId: string): Promise<Result<Loan[], Error>> {
    const loans: Loan[] = [];

    for (const [id, state] of this.store) {
      if (state.memberId === memberId && state.returnedAt === null) {
        loans.push(Loan.fromState(id, state));
      }
    }

    return ok(loans);
  }
}
```

Filter over raw state, rehydrate through `Entity.fromState`, and return a `Result`. The
use case then reads as business language — `findActiveLoansForMember(memberId)` — rather
than as a filter expression.
