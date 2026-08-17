---
name: ontologic-domain-modeling
description: Author or modify domain models in a project using the `ontologic` library — domain entities, value objects, domain events, typed domain errors, and invariants. Use when adding a new aggregate, adding behavior to an existing entity, defining events, errors or invariants, or when working with files matching *.entity.ts, *.event.ts, *.error.ts.
---

# Ontologic — domain modeling

Building blocks for the domain layer. Everything imports from the package root:
`import { DomainEntity, DomainEvent, DomainError, BaseDomainInvariant, ok, err } from "ontologic"`.

## Mental model

An entity owns its state and is the only thing allowed to change it. Callers never
receive the live state — they get a decoupled copy from `readState()`, which also
re-checks the entity's invariants. A behavior method **mutates the state and returns the
event that records what happened**, wrapped in a `Result` when it can fail.

That gives three separate failure channels, and mixing them up is the most common
mistake with this library:

| Channel | When | Mechanism |
|---|---|---|
| `Result` | The business says no | `return err(new SomeDomainError(...))` |
| Thrown `Error` | Infrastructure broke | `throw` |
| `CorruptedStateError` | State violates an invariant | Thrown for you — never wrap it in a `Result` |

## Adding an aggregate — checklist

1. Create `entities/<name>/<name>.entity.ts` with a `<Name>State` interface and a class
   extending `DomainEntity<<Name>State>`.
2. Give it a **private constructor** that calls `super(id, state)` then `addInvariant(...)`.
3. Add `static fromState(id, state)` — this is the mapper the repository uses.
4. Add `static create(params)` returning `{ <name>, creationEvent }`.
5. For each behavior: guard clauses returning `err(...)` first, then mutate `this.state`,
   then `return ok(new SomeEvent(this.id(), payload))`.
6. Add each event under `events/`, and **add it to the `<Name>Event` union** in
   `events/<name>Events.ts`.
7. Add each error under `errors/` — remember `Object.setPrototypeOf`.
8. Re-export the aggregate's errors from the entity file.

## Layout

```
entities/subscription/
├── subscription.entity.ts       # State interface + class + re-exports its errors
├── events/
│   ├── subscriptionCreated.event.ts
│   └── subscriptionEvents.ts    # union type — always update this
├── errors/
│   └── invalidStatusTransition.error.ts
├── invariants/
│   └── subscriptionHasPlan.ts   # exports `const <name>Invariant`
└── __tests__/subscription.entity.test.ts
```

## Copy-ready templates

A complete, compiling aggregate lives in `../ontologic-templates/templates/src/domain/entities/subscription/`.
Copy the files and rename. They are type-checked in CI, so they always match the
installed version of the library.

## Traps

- `Object.setPrototypeOf(this, X.prototype)` is **required** in every `DomainError`
  subclass. `DomainError`'s constructor resets the prototype, so omitting it makes
  `instanceof YourError` return `false` while `instanceof DomainError` stays `true`.
- Invariants use `complyWith(state).isCompliant`. There is no `isSatisfiedBy`.
- `DomainInvariant` and the standalone `and`/`or`/`not` operators are **not exported**.
  Use `BaseDomainInvariant` and its `.and()` / `.or()` / `.not()` / `.xor()` / `.andNot()` methods.
- A behavior method returning `void` instead of the event is a bug — the caller needs the
  event to pass to `saveWithEvents`.
- Do not throw domain failures from an entity method. Return `err(...)`.

## Deeper references

In this skill:

- `references/entity.md` — the two factories, state access, aggregates with sub-entities and `serialize`
- `references/events-and-errors.md` — event versioning, the union file, why `setPrototypeOf` matters
- `references/testing.md` — vitest patterns for domain code

On the docs site:

- Invariants, composition, and `CorruptedStateError` — <https://ontologic.site/docs/domain-model/invariants>
- Value objects (concepts without identity) — <https://ontologic.site/docs/domain-model/value-object>
- The Result pattern — <https://ontologic.site/docs/domain-model/result-pattern>
- Everything in one file — <https://ontologic.site/llms-full.txt>
