---
sidebar_position: 1
---

# Use Case

An entity knows its own rules. A use case knows everything else: which aggregates to load,
which rule spans more than one of them, and what to persist when the domain says yes.

`ontologic` gives you one interface for it.

```typescript
export interface UseCase<
  Action extends ActionInterface,
  Output,
  Errors extends DomainError<string, unknown>,
> {
  execute(action: Action): Promise<Result<Output, Errors>>;
}
```

Three type arguments, and each one is a contract: what the use case is **asked** to do,
what it **produces**, and which domain failures a caller **must** handle.

## The action is a Command or a Query

A use case does not take a loose input object. It takes an **action**, and the action
carries the intent.

A `Command` is a request to change something, which the domain may refuse. A `Query` is a
request to read, which it cannot. Both are declared the same way a `DomainEvent` is — a
literal name bound once in the subclass, and a payload:

```typescript
import { Command, Query } from "ontologic";

export class PayOrderCommand extends Command<
  "PAY_ORDER",
  { id: string; invoiceId: string }
> {
  constructor(payload: { id: string; invoiceId: string }) {
    super({ name: "PAY_ORDER", payload });
  }
}

export class ReadOrderQuery extends Query<"READ_ORDER", { id: string }> {
  constructor(payload: { id: string }) {
    super({ name: "READ_ORDER", payload });
  }
}
```

Choose by what the use case does with its aggregates. If it calls `save` or
`saveWithEvents`, it is a command. If it only reads, it is a query.

That choice is not a comment. Each class holds private fields, so the two are **nominally
distinct**: a `Query` is never assignable where a `Command` is expected, even when the
payloads are identical.

```typescript
declare function pay(command: PayOrderCommand): void;

pay(new ReadOrderQuery({ id: "order-1" }));
// Argument of type 'ReadOrderQuery' is not assignable to parameter of type
// 'PayOrderCommand'. Type 'ReadOrderQuery' is missing the following properties
// from type 'PayOrderCommand': #name, #payload
```

Both expose `name`, `payload` and `kind` (`"command"` or `"query"`), and both clone the
payload on the way in and on the way out — so nothing that hands you an action can mutate
it afterwards, and nothing you do with `action.payload` reaches back into it.

Because every read of `payload` produces a fresh clone, destructure it once at the top of
`execute` rather than reaching for it repeatedly.

## Writing a use case

Dependencies are constructor parameters — one per aggregate the use case touches:

```typescript
import { Result, UseCase, err, ok, switchGuard } from "ontologic";

export class PayOrderUseCase
  implements UseCase<
    PayOrderCommand,
    OrderState,
    InvalidStatusTransition | EntityNotFound
  >
{
  constructor(private readonly orders: OrderRepository) {}

  async execute(
    command: PayOrderCommand,
  ): Promise<Result<OrderState, InvalidStatusTransition | EntityNotFound>> {
    const { id, invoiceId } = command.payload;

    const resultGetById = await this.orders.getById(id);

    if (resultGetById.isErr()) {
      throw resultGetById.error; // technical failure → throw
    }

    const order = resultGetById.value;

    if (order === undefined) {
      return err(new EntityNotFound("This order does not exist", { entityId: id }));
    }

    const result = order.pay({ invoiceId });

    if (result.isErr()) {
      switch (result.error.name) {
        case "INVALID_STATUS_TRANSITION":
          return err(result.error);
        default:
          switchGuard(result.error.name);
      }
    }

    const saveResult = await this.orders.saveWithEvents(order, result.value);

    if (saveResult.isErr()) {
      throw saveResult.error;
    }

    return ok(order.readState()); // return the state, never the entity
  }
}
```

The rule that decides every branch: **technical failures are thrown, domain failures are
returned**. A dead database is not a business outcome. A missing order might be — that is a
decision the domain gets to make, so it comes back in the `Result`.

## The error side cannot be widened

This does not compile:

```typescript
export class PayOrderUseCase
  implements UseCase<PayOrderCommand, OrderState, Error> {}
//                                                 ^^^^^
// Type 'Error' does not satisfy the constraint 'DomainError<string, unknown>'.
//   Property 'context' is missing in type 'Error'.
```

`Errors` is constrained to `DomainError`, and `DomainError` declares a `context` property
that plain `Error` does not have. So `Result<T, Error>` is rejected at the type level.

That is deliberate. A widened error union throws away the exhaustiveness checking that
makes [`switchGuard`](../domain-model/result-pattern.md) useful, and leaves callers unable
to see what they have to handle. Name the failures:

```typescript
export type RegisterLoanError =
  | BookNotFoundError
  | BookLostCannotBeLoanedError
  | BookAlreadyOnLoanError
  | MemberActiveLoanLimitExceededError;
```

A use case with no domain failure mode says so with `never`:

```typescript
export class AddBookUseCase
  implements UseCase<AddBookCommand, BookState, never> {}
```

## Read many aggregates, write one

`saveWithEvents(entity, events)` is the only atomic unit — there is no cross-aggregate
transaction. So a use case should **read from as many aggregates as it needs and write to
exactly one**.

Each aggregate it touches is one more constructor parameter, which makes the shape visible
at the top of the class:

```typescript
export class RegisterLoanUseCase
  implements UseCase<RegisterLoanCommand, LoanState, RegisterLoanError>
{
  constructor(
    private readonly libraryCollection: LibraryCollection, // read
    private readonly loanRegister: LoanRegister,           // written
  ) {}
}
```

Needing two writes is a signal that the aggregate boundary is wrong, or that the second
change should be driven by an event instead.

## Keep the framework out

A use case is a plain class. Don't put `@Injectable()` or any other framework decorator on
it — wiring it into a container is the composition root's job:

```typescript
// NestJS, in the module — the use case stays framework-free
{
  provide: RegisterLoanUseCase,
  useFactory: (books: LibraryCollection, loans: LoanRegister) =>
    new RegisterLoanUseCase(books, loans),
  inject: [LibraryCollection, LoanRegister],
}
```

## Why declare all this

Beyond the compiler checks, a declared use case is one a **tool can read**. `implements
UseCase<PayOrderCommand, OrderState, …>` is a written type reference, so its action, its
output and its failure modes can be recovered from the source without running anything —
which is what lets documentation and diagrams be generated from the code rather than
maintained beside it.

Where use cases were only a naming convention, none of that was knowable: an exported
async function returning a `Result` might be a use case, or might be a helper.

## Where to go next

- [Repository](../domain-model/repository.md) — the port a use case loads and saves through
- [Result pattern](../domain-model/result-pattern.md) — `ok`, `err` and `switchGuard`
- [Domain Entity](../domain-model/domain-entity.md) — which rules belong on the entity instead
