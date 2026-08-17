# Ontologic

A TypeScript toolkit for building software that speaks your domain's language.
Model your business rules, protect your invariants, and make failures explicit.

## Documentation

Full documentation, guides, and examples are available at:

**[ontologic.site](http://ontologic.site)**

## Quick start

```bash
npm install ontologic
```

## What's inside

- **Domain Entity** — Entities that own their state and enforce their own rules
- **Invariants** — Business rules checked on every state read, not just after specific operations
- **Domain Events** — Immutable, versioned facts about what happened in your domain
- **Result Pattern** — Typed domain failures as return values, not hidden exceptions
- **Repository** — Persistence interface that saves entity state and events atomically
- **Event Bus** — Types event bus that allows to publish and listen to your domain events
- **Message Relay** — Built-in Outbox Pattern with in-memory component for fast prototyping
- **Workflows** — Typed, resumable pipelines for multi-step business processes

## Examples

### Library Management App

A full-featured library management application built with NestJS, demonstrating all Ontologic features on a real-world use case:

**[sachacr/library-examples](https://github.com/sachacr/library-examples)**

### Smaller examples

Focused examples (entity, invariants, events, use cases) are in the [`src/examples/`](https://github.com/SachaCR/ontologic/tree/main/src/examples) directory — a credit balance aggregate and an order lifecycle.

## License

MIT
