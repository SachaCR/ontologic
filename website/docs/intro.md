---
sidebar_position: 1
---

# Introduction

Software has a tendency to drift away from the business it was built to serve.

It starts small: a rule that should belong to the domain ends up in a controller. A concept that has a precise name in the business is called something vague in the code. A constraint that everyone agrees on lives in three different places — or none. Over time, the code and the business speak different languages, and every change becomes a translation exercise.

**Domain-Driven Design** (DDD) is a set of principles and patterns that fights this drift. The core idea is simple: let the business domain — its vocabulary, its rules, its logic — drive the structure of your code. When your code reflects the real world it models, it becomes easier to understand, easier to change, and harder to get wrong.

`ontologic` is a TypeScript library that gives you the building blocks to do this in practice. It provides a small set of well-defined primitives that encode DDD concepts directly into your type system — so you spend less time enforcing patterns manually and more time thinking about your domain.

---

## Core concepts

`ontologic` is organized around a few key ideas. Each one has its own page — read them in order if you're new to DDD, or jump to what you need.

### [Domain Entity](./domain-entity.md)

An entity is a domain object with a unique identity and a lifecycle. It owns its state, enforces its invariants, and exposes behavior rather than raw data. If you're new to `ontologic`, start here.

### [Domain Events](./domain-events.md)

A domain event is a record that something meaningful happened — past tense, immutable, and named after a business fact. Events are the mechanism by which different parts of your system stay in sync without becoming tightly coupled.

### [The Result Pattern](./result-pattern.md)

Some failures are not bugs — they are valid branches of the business logic. The Result pattern makes those failures explicit in the type system, so callers are forced to handle them and errors carry structured context rather than just a message string.

### [Invariants](./invariants.md)

An invariant is a rule that must always be true about an entity — not just after certain operations, but at all times. `ontologic` checks invariants on every state read, catching corrupted data the moment it enters the system.

### [Repository](./repository.md)

The repository is the interface between your domain and your persistence layer. It hides all database details behind a clean, domain-friendly API and ensures that entity state and domain events are always saved together in a single transaction.

---

## Who is this for?

`ontologic` is for TypeScript developers who want to apply DDD patterns without writing a lot of boilerplate, and without committing to a heavy framework.

You don't need prior DDD experience — the documentation explains concepts from first principles. But if you're already familiar with DDD, you'll find the primitives familiar and the TypeScript integration straightforward.

---

## Installation

```bash
npm install ontologic
```

That's it. `ontologic` has no runtime dependencies.
