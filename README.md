# Ontologic

A TypeScript toolkit for building software that speaks your domain's language.
Model your business rules, protect your invariants, and make failures explicit.

## Documentation

Full documentation, guides, and examples are available at:

**[ontologic.site](https://ontologic.site)**

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

## Examples

A complete example (entity, invariants, events, use cases) is in the [`examples/`](./examples) directory — a credit balance aggregate with creation, credit, debit, and error handling.

## License

MIT
