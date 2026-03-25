---
slug: introducing-ontologic
title: Introducing Ontologic
authors: [sacha]
tags: [ddd, typescript, architecture, release]
---

Every codebase starts with good intentions.

You write clean services, keep your controllers thin, and promise yourself the business logic will stay in one place. Then the codebase grows. A deadline arrives. A rule that should belong to the domain ends up in a controller. A constraint that everyone agrees on gets copy-pasted into three different places. The code and the business start speaking different languages — and every change becomes a translation exercise.

I built **Ontologic** because I kept running into this problem, and I wanted a principled way out of it.

<!-- truncate -->

## The idea behind it

Domain-Driven Design has a compelling answer to this problem: let the business domain drive the structure of your code. Name things the way the business names them. Put the rules where the things that own them live. Make the failures your business cares about explicit in the type system, not hidden in try/catch blocks.

The problem is that applying DDD in practice requires discipline and boilerplate. Without the right primitives, patterns drift. Invariants get checked in some methods but not others. Events get produced in some places but never in others. The good intentions erode.

Ontologic is a small TypeScript library that gives you those primitives — a tight set of building blocks that encode DDD concepts directly into your type system.

## What it gives you

**Domain Entities** that own their state. No external code can mutate an entity directly. The entity is the single authority on what it can and cannot do.

```typescript
class BankAccount extends DomainEntity<BankAccountState> {
  withdraw(amount: number): Result<MoneyWithdrawn, InsufficientFunds> {
    if (this.state.balance < amount) {
      return err(new InsufficientFunds({
        available: this.state.balance,
        requested: amount,
      }));
    }
    this.state.balance -= amount;
    return ok(new MoneyWithdrawn(this.id(), { amount }));
  }
}
```

**Invariants** that never sleep. A rule attached to an entity is checked every time the state is read — not just after specific operations, but whenever data enters the system. A corrupted row loaded from the database is caught immediately, before it can do any damage.

```typescript
const balanceIsPositive = new BaseDomainInvariant<BankAccountState>(
  "Balance must be positive",
  (state) => state.balance >= 0
);
```

**The Result pattern** for domain failures. Not every failure is an exception. When the business knows something can go wrong — insufficient funds, a slot already taken, a coupon already used — that failure deserves a name, a type, and structured context. The caller is forced to handle it. There is no hiding.

**Domain Events** that are immutable facts. Past tense, versioned, deep-cloned on construction. Once `MoneyWithdrawn` exists, it cannot be changed. It is a permanent record of something that happened, and it is a public contract — something the rest of the system can rely on.

**A Repository** that saves entity state and events in a single transaction. You never get a state change without a record of what happened. Combined with the Outbox pattern, every event is eventually delivered — even if the message broker has a bad moment.

## Why not just use an existing framework?

I looked at the existing options. Some are excellent, but most are either too heavy (they come with opinions about your entire architecture) or too thin (they give you base classes but no guidance on how the pieces fit together).

Ontologic aims for a specific sweet spot: enough structure to make the right patterns easy, not so much that it takes over your application. There are no decorators, no dependency injection container, no framework lock-in. Just TypeScript classes and a small runtime with no external dependencies.

You can introduce it incrementally. Start with a single entity. Add invariants when you have rules worth protecting. Add events when you have operations that other parts of the system care about.

## What's next

The core primitives are stable. What I want to build next:

- More examples — the bank account is a good teaching tool, but real domains are messier and more interesting
- Guides on applying Ontologic in a full use case: HTTP handler → use case → entity → repository → event bus
- Maybe some work around an Event Bus interface.


If you're building something with DDD in TypeScript, I'd love to hear what's working and what isn't. The best way to reach me is [GitHub](https://github.com/SachaCR/ontologic).

---

`npm install ontologic`
