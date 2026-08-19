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
├── entities/plan/                               # a SECOND aggregate, deliberately minimal
│   ├── plan.entity.ts                           # read-only fact source for the cross-aggregate rule
│   ├── events/planCreated.event.ts, events/planEvents.ts
│   └── errors/planNoLongerOffered.error.ts      # named after Plan, raised by a Subscription use case
├── subscription.repository.ts                   # InMemoryRepository<Entity, Event>
├── plan.repository.ts
└── useCases/
    ├── activateSubscription.use-case.ts         # single-aggregate: the canonical sequence
    ├── subscribeToPlan.use-case.ts              # CROSS-aggregate: reads Plan, writes Subscription
    ├── subscribeToPlanViaCampaign.use-case.ts   # builds one of its OWN events
    ├── readSubscription.use-case.ts             # a READ: declared over a Query, writes nothing
    ├── commands/*.command.ts
    ├── queries/readSubscription.query.ts
    └── errors/entityNotFound.error.ts
```

`subscribeToPlan.use-case.ts` is the one to read when deciding where a rule goes. "A
subscription may only be created for a plan that is still offered" needs the `Plan`
aggregate, so it cannot be a `Subscription` invariant — it lives in the use case, the
`Plan` is read and never written, and the write goes to exactly one aggregate.

Read `activateSubscription.use-case.ts` and `readSubscription.use-case.ts` side by side to
see the command/query split: the bodies differ only in that one saves, and the type
argument says which before you read either body.

`subscribeToPlanViaCampaign.use-case.ts` is the exception to "events come from the entity".
A campaign is not something a `Subscription` should know about, so the use case records the
conversion itself and saves it alongside the aggregate's own creation event — added to
them, never substituted for them. Reach for `subscribeToPlan.use-case.ts` first; use this
shape only when modelling the fact on the aggregate would mean teaching it a context it has
no business holding.

Imports are written the way a consumer writes them — `from "ontologic"` — so a copied
file works unchanged in an application.

For the reasoning behind each pattern, see the `ontologic-domain-modeling` and
`ontologic-application` skills.
