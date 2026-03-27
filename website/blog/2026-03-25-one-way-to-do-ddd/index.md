---
slug: one-way-to-do-ddd
title: "Ontologic: one way to do DDD, not the only way"
authors: [sacha]
tags: [ddd, architecture]
---

There is no single correct way to do Domain-Driven Design.

DDD is a set of ideas, not a specification. Eric Evans wrote a book. Other people wrote other books. Practitioners have been arguing about the details for twenty years, and the arguments are productive — because the domain you're modelling, the team you're working with, and the constraints you're under all genuinely affect what good DDD looks like in your specific situation.

Ontologic is my way of doing it. I want to be transparent about that.

<!-- truncate -->

## What Ontologic is

Ontologic is a small TypeScript library that captures the patterns I reach for when I apply DDD. It reflects decisions I've made — about where invariants should live, how domain failures should be expressed, what a repository should look like — that work well for me and the codebases I've worked on.

Those decisions are opinionated. They are not universal truths.

Other developers have built other libraries, other frameworks, other patterns that work equally well or better for their contexts. If you've read about DDD elsewhere and something doesn't match what you see here, that's not necessarily a contradiction — it might just be a different valid approach.

## Minimal by design

Ontologic is intentionally small. It gives you base classes and types for the core DDD building blocks: entities, invariants, events, results, and a repository interface. It does not give you a full application framework, a dependency injection container, or opinions about your folder structure.

This is a deliberate constraint.

A smaller library is easier to understand, easier to trust, and easier to adapt. If Ontologic does 80% of what you need but the last 20% requires a different shape, feel free to extend the base classes and interfaces. If it's not flexible enough for you, the right answer should be to fork it and change it, or to work around it with hacks.

The source is short. The concepts are explicit. If you need more, take what's here and build on it.

## Zero dependencies

Ontologic has no runtime dependencies. This was a firm decision from the start.

Every dependency you add to a library becomes a dependency of every project that uses it. If Ontologic depended on a logging library, a validation library, or a result-type library, every consumer of Ontologic would transitively depend on those too — whether they wanted them or not. They might conflict with versions the consumer already uses. They add weight to bundles. They create update obligations that aren't yours to manage.

Keeping the dependency count at zero keeps Ontologic's footprint clean and its impact on your project predictable.

### A note on the Result type

The `Result` type in Ontologic — `ok`, `err`, `Result<T, E>` — is directly inspired by and largely copied from [neverthrow](https://github.com/supermacro/neverthrow), an excellent library by Gil Mizrahi.

I did not want to add neverthrow as a dependency for the reasons above. But I also did not want to reinvent the API — neverthrow's design is clean and the developer experience is good. So I vendored the relevant parts: copied the source, adapted it slightly, and include it directly in the Ontologic package.

This means:

- You do not need to install neverthrow separately
- There is no version conflict risk between the two
- The API is familiar if you already know neverthrow

If you're already using neverthrow in your project, the two `Result` types won't be the same object at runtime — they're different implementations with the same shape. In practice this means you shouldn't mix them in the same function signature, but you can use both in the same codebase without issues.

Credit to Gil and the neverthrow contributors for the original design.

## Use it, adapt it, replace it

Ontologic is a starting point. If it fits your domain and your team's way of thinking, use it as-is. If it almost fits, fork it and change what doesn't. If it doesn't fit at all, the concepts in the documentation might still be useful even if you implement them differently.

The goal was never to be the definitive DDD library for TypeScript. It was to have a clean, well-understood set of primitives that I trust and can explain to anyone on my team in an afternoon.

If it's useful to you in the same way, that's the best outcome I could hope for.
