---
name: ontologic-templates
description: Copy-ready reference files for the `ontologic` library — a complete, compiling example aggregate with its entity, events, typed errors, invariants, repository and use case. Read these when you need a known-correct starting point to copy and rename, or to check the exact shape of an Ontologic file before writing one.
---

# Ontologic — reference templates

A single coherent example domain (`Subscription`) showing every Ontologic file type in
its idiomatic form. **These files are type-checked against the library in CI**, so they
always match the installed version — unlike a snippet in prose, they cannot rot.

Copy a file, rename the domain concept, and adjust. The comments explain the parts that
are load-bearing.

```
templates/src/domain/
├── entities/subscription/
│   ├── subscription.entity.ts                   # private ctor, create/fromState, Result-returning behavior
│   ├── events/
│   │   ├── subscriptionCreated.event.ts         # DomainEvent subclass
│   │   ├── subscriptionActivated.event.ts
│   │   └── subscriptionEvents.ts                # the union — always update it
│   ├── errors/
│   │   └── invalidStatusTransition.error.ts     # DomainError + Object.setPrototypeOf
│   └── invariants/
│       └── subscriptionHasPlan.ts               # BaseDomainInvariant
├── subscription.repository.ts                   # InMemoryRepository<Entity, Event>
└── useCases/
    ├── activateSubscription.use-case.ts         # the canonical use-case sequence
    └── errors/entityNotFound.error.ts
```

Imports are written the way a consumer writes them — `from "ontologic"` — so a copied
file works unchanged in an application.

For the reasoning behind each pattern, see the `ontologic-domain-modeling` and
`ontologic-application` skills.
