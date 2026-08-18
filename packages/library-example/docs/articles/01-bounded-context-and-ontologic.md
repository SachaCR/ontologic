# Modeling a domain with Ontologic — Part 1: The Librarian’s Problems

This is the first article in a hands-on series about shaping a real-world kind of problem into code using **[Ontologic](https://www.npmjs.com/package/ontologic)**. Each article focuses on **one main idea** and points to the **[library-examples](https://github.com/SachaCR/ontologic/tree/main/packages/library-example)** repo so you can read, run, and change the code yourself.

**In this article** we stay close to the **problem**: a small library moving off a paper register. We derive use cases and rules in plain language, spot **Book** and **Loan** as things with lifecycles, then model our first **Domain Entity** the `Book`.

---

## From the librarian’s problem to modeling

Imagine you work with a **small town library** that still runs lending off a **paper register**. Staff write down who borrowed which book, when it is due, and when it came back. Searching the catalogue means walking the shelves or flipping a card file. They want to **digitize** that experience: one place to record copies, find books, and track loans.

We are not coding yet naming folders or installing packages. The goal is to notice, together, that the language of the business already points toward how we might model the system later.

---

## What the app should help them do

If we listen to how they describe their day, we hear the Staff talking about `Books`, `ISBN`, `Loans` and `Members`. For our teaching project, we narrow that to a manageable set of use cases:

- **Add a book** to their collection when new books arrive (title, author, ISBN, and so on).
- **Search for a book** the collection when a library member asks for a book by title or author.
- **Lend a book** to a member: record who has it, when the loan started, and when it is due back.
- **Return a book** when the book comes back.
- **Mark a book as lost** when it does not return and the library writes it off.
- **See what is still out** for the whole register, or **for one member** (useful when someone asks, “What do I still have at home?”).

Those are **use cases** in everyday language: discrete jobs the software must support. We have not said “entity” or “database” yet.

---

## Library's Business Rules

Paper or software, the library has **policies**. Some are obvious; some only come up when you speak enough with the librarian:

- **One book, one active loan.** The same physical book cannot be on two open loans at once. If it is already out, you refuse or queue the request.

- **Lost books cannot be lended.** A book marked lost is no longer lendable.

- **Borrowing limits.** The library caps how many books someone may have **at the same time**. In our example repo that cap is **three** concurrent active loans per member.

- **Dates have to make sense on a loan.** A due date should not be before the loan date; you cannot “return” before you borrowed. Those sound obvious but they are exactly the kind of detail that blows up a naive form if nobody encodes them.

When someone says, “The system must **never** allow X,” they are not describing a button, they are describing a **rule that must hold no matter which screen or API triggered the action**. In modeling terms, rules that must **always** be true for a given thing (or a given operation) are often talked about as **invariants**: properties and constraints we refuse to violate when we change state.

---

## Listening for “things” that live and change

Read the use cases again and notice the **nouns** that are used.

- A **Book** is added once, can be found, can be marked lost, and can be tied to a loan. It has a **lifecycle**: it exists over time, and its state (available, out, lost) matters.

- A **Loan** is opened, then either **closed** by a return or left **open** until then.

When a concept has **identity** (“which book?”, “which loan?”) and **state that evolves** over its life, it is a strong candidate to model as an **Entity**.

By contrast, a **member** in our example repo stays thin: we only need an identifier (like a library card number) to know _who_ borrowed. We are not modeling their address, fines, or reading history here. That keeps the example small; a real system might later promote “member” to its own entity with its own rules.

So far, **discovered from the story**: at least **Book** (one row per copy we track) and **Loan** as entities worth modeling explicitly.

---

## Discovering structure in the rules

Some rules attach naturally to **one** of those things:

- “This book is lost” belongs to the **Book Entity** .
- “Due after loan date” belongs to the **Loan Entity**.

Others **connect** two things or the register as a whole:

- “Not already on loan” ties a **Book** to **open Loans**.
- “At most three active loans for this member” ties **Loans** to a **member id** and a **count**.

That split is useful later: **Invariants** often live **on** the entity they protect; **Business Rules** lives in a **use case** that coordinates several entities.

---

## Modeling the book: start with state

We said a **Book** is something the library tracks over time. Before we talk about Ontologic or constructors, we write down **what we need to remember** about each book in the system: the catalogue fields staff already care about (title, author, ISBN, category, tags) and whether this book is **lost** or not. In TypeScript that becomes an interface `BookState` with those fields.

```typescript
export interface BookState {
  title: string;
  author: string;
  isbn: string;
  category: string;
  tags: string[];
  lost: boolean;
}
```

Nothing clever yet: **state** is just the data we agree represents “a book _as we know it right now_.”

## Turning state into a `DomainEntity`

Next we declare a class `Book` that **extends** `DomainEntity<BookState>`.
Ontologic gives us a simple way model to an **Entity** and encapsulate it's internal **State**.

```typescript
import { DomainEntity } from "ontologic";

export class Book extends DomainEntity<BookState> {
  constructor(id: string, state: BookState) {
    super(id, state);
  }
}
```

At this point we have named the **Entity** and its **State**; we still need to decide **how** the outside world is allowed to change that state.

---

### Creating an Entity

If you keep talking with the librarian, they might mention that they **track how many books are added to the collection each month** for reporting, budgets, or grants. That is a useful insight: introducing a new book is an **interesting event for the business**. In the model, this is what we call a **domain event**. In the code, [`BookCreatedEvent`](https://github.com/SachaCR/ontologic/blob/main/packages/library-example/src/domain/entities/book/events/bookCreated.event.ts) (see the class definition in the repo for the payload and `BOOK_CREATED` name).

So when we **create** a `Book` in the code, we must **emit** that event in the same move as building the entity. Anything that “adds a book” without producing the event could break the librarian’s monthly picture.

In **JavaScript and TypeScript**, a **constructor cannot return anything other than the instance** (or throw). The expression `new Book(...)` always evaluates to the **`Book` object**. You cannot type a constructor so callers get both the entity and its `BookCreatedEvent` from a single `new`.

You might try to stash the event in the entity's state (that's a path I've explored at some point) but it **pollutes** the state and requires developers to remember they need to go fetch the event from the state afterwards. I think it is more explicit if the entities methods directly returns a **domain event** as a consequence of a command/mutation. It makes it harder to forget.

A good solution to workaround this limitation of the constructor is to **hide** construction behind a **`private constructor`**: only methods **inside** the class may call `new Book(...)`. We expose **`static create(...)`**, which allocates id, builds initial state, constructs the book **once**, builds **`BookCreatedEvent`**, and returns **both** in one object—something the language allows for ordinary methods but not for `new`.

This technique also allows to name the creation logic with a domain term if there is one. Here I chose `create` for simplicity but we could go deeper in the domain modeling with something like `Book.createNewBookToRegister()`.

```typescript
import { randomUUID } from "node:crypto";
import { DomainEntity } from "ontologic";
import { BookCreatedEvent } from "./events/bookCreated.event";

export class Book extends DomainEntity<BookState> {
  private constructor(id: string, state: BookState) {
    super(id, state);
  }

  static create(state: Omit<BookState, "lost">): {
    book: Book;
    event: BookCreatedEvent;
  } {
    const id = randomUUID();
    const initialState: BookState = { ...state, lost: false };
    const event = new BookCreatedEvent(id, initialState);

    return {
      book: new Book(id, initialState),
      event,
    };
  }
}
```

Then in a use case the code looks like this:

```typescript
const { book, event } = Book.create({
  title: "Clean Code",
  author: "Robert C. Martin",
  isbn: "9780134685991",
  category: "software",
  tags: ["craft"],
});

await libraryCollection.saveWithEvents(book, event);
```

So the private constructor is not secrecy for its own sake; it is a **discipline**: new books always go through `create` and always carry their **creation event**.

Notice that you can perfectly keep a classic constructor and not generate any domain event if **your domains** don't need to. Ontologic tries to give you the maximum freedom on **How** you do things.

---

## Behavior: declaring a book lost

A useful first behavior is **mark this book as lost**. The business rule is simple: you cannot declare the same book lost twice.

Not every refusal is a **bug** or an **error**. A staff member might submit “declare lost” twice, or two desks might race the same request. The library’s answer “this book is **already** lost” is a **normal, valid business outcome**, not a crashed server or a programmer mistake. The code should represent that outcome **on purpose**, so callers can show a clear message, log it, or map it to an HTTP response later. Throwing an exception hoping that it will be properly handled so it does not crash the full application is very risky. When an action can "fail" for business reasons it must be part of the domain model and handled explicitly.

In Ontologic, a **domain error** is a small, typed value, typically a class extending `DomainError` with a stable **`name`** (for example `BOOK_ALREADY_DECLARED_LOST`), a **message** for people, and optional **context** (such as the book id). It lives in the domain layer; it is not an HTTP status and not a technical error. It says: _the operation was rejected for a reason the business understands_.

```typescript
import { DomainError } from "ontologic";

export class BookAlreadyDeclaredLostError extends DomainError<
  "BOOK_ALREADY_DECLARED_LOST",
  { bookId: string }
> {
  constructor(bookId: string) {
    super({
      name: "BOOK_ALREADY_DECLARED_LOST",
      message: "This book has already been declared lost",
      context: { bookId },
    });
  }
}
```

To model both branches without `throw`/`catch` we use **`Result<Success, Failure>`** from Ontologic: either **`ok(successValue)`** or **`err(failureValue)`**, where `failureValue` is usually a domain error. The type of the method documents both possibilities: success might carry a **domain event**. Failure carries **`BookAlreadyDeclaredLostError`**. Use cases and controllers can then branch on `result.isOk()` / `result.isErr()`. Also in JS/TS thrown errors are not typed. On the contrary by using the result pattern the error path is typed and you know exactly what kind of failure you're manipulating.

So `declareLost` **returns** a `Result`: on success we update state and hand back a `BookLostEvent`; on failure we hand back a domain error.

```typescript
import { Result, err, ok, DomainEntity } from "ontologic";

export class Book extends DomainEntity<BookState> {
  constructor(id: string, state: BookState) {
    super(id, state);
  }

  declareLost(): Result<BookLostEvent, BookAlreadyDeclaredLostError> {
    const state = this.readState();

    if (state.lost) {
      return err(new BookAlreadyDeclaredLostError(this.id()));
    }

    this.state = { ...state, lost: true };

    return ok(new BookLostEvent(this.id()));
  }
}
```

## Wrapping up

We started from a **concrete situation** (paper register, digitization) and listed **use cases** and **rules** before naming **entities** (`Book`, `Loan`) and where rules sit (**invariants** on one thing vs coordination in a **use case**). For **`Book`**, we defined **`BookState`**, wrapped it in **`DomainEntity`**, and showed why **adding a copy** must produce a **`BookCreatedEvent`**—then why **`private constructor` + `static create`** is the idiomatic TypeScript answer when the constructor cannot return `{ book, event }`. We closed with **`declareLost`**, **`DomainError`**, and **`Result`** so **expected refusals** stay in the model with **typed** failure, not untyped throws.

## Where to see it in the repo

The `Book` entity that matches this walkthrough lives in [`src/domain/entities/book/book.entity.ts`](https://github.com/SachaCR/ontologic/blob/main/packages/library-example/src/domain/entities/book/book.entity.ts), with `BookCreatedEvent` and `BookLostEvent` under [`src/domain/entities/book/events/`](https://github.com/SachaCR/ontologic/tree/main/packages/library-example/src/domain/entities/book/events) and `BookAlreadyDeclaredLostError` in [`src/domain/entities/book/errors/book.errors.ts`](https://github.com/SachaCR/ontologic/blob/main/packages/library-example/src/domain/entities/book/errors/book.errors.ts).
