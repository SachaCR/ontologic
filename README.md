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

## Using Ontologic with AI coding agents

Ontologic ships conventions that AI coding agents can read directly, so they write
idiomatic domain code instead of guessing at the API.

```bash
npx ontologic init-agents
```

This drops an `AGENTS.md` and a set of skills into your project — covering the folder
layout, the entity/event/error/invariant patterns, the return-vs-throw error rule, and
the mistakes agents most often make with this library. It is read by Claude Code, Cursor,
Codex, and anything else that honours `AGENTS.md`.

For tools that consume documentation over the network, the full docs are published in
[llms.txt](https://llmstxt.org) format:

- <https://ontologic.site/llms.txt> — index
- <https://ontologic.site/llms-full.txt> — complete documentation in one file

## License

MIT
