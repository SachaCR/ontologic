---
slug: ontologic-is-now-a-monorepo
title: Ontologic is now a monorepo
authors: [sacha]
tags: [typescript, architecture, release]
---

Here is a line from the library example I point people at when they ask what an Ontologic entity looks like:

```ts
super(id, state, [dueDateAfterLoanDate, returnDateAfterLoanDate]);
```

It does not compile. It stopped compiling the day 1.7.0 shipped, when invariants moved from a positional array to an options object. The example sat in its own repository, on `"ontologic": "^1.6.2"`, and nothing ever built the two together — so nothing failed, and I did not notice. The example kept being the first real code people read, and it kept being wrong.

That is what the monorepo is for.

<!-- truncate -->

## One repository, three packages

Ontologic now lives in a pnpm workspace with turbo on top:

- **`ontologic`** — the library, still 1.7.1, still published under the same unscoped name.
- **`library-example`** — the lending-library application, private, not published.
- **`@ontologic/domain-explorer`** — new, and not on npm yet. More on it below.

The line that matters is in the example's manifest:

```json
"ontologic": "workspace:*"
```

Not a version range. The example resolves to the library source sitting in the same commit. `pnpm build` typechecks both, in dependency order, and a change to the library that breaks the example fails right there — at the change, not weeks later when someone copies a snippet that no longer works.

Moving the example in surfaced that `super(id, state, [...])` immediately. It is now:

```ts
super(id, state, {
  invariants: [dueDateAfterLoanDate, returnDateAfterLoanDate],
});
```

One line. It had been wrong since 1.7.0 shipped a month ago.

## The example was the thing that had to move

I could have fixed that line without a monorepo. Bump the dependency, run the build, push. Ten minutes.

But I would have been fixing the symptom. A separate repository on a caret range gets exactly the attention that separate repositories get: you remember it right after you break it, and then you stop remembering. Documentation rots quietly, and example code rots in the worst way — it stays readable, it stays plausible, and it stops being true.

The fix is not discipline. It is putting the example in the build, where being out of date is a failure rather than an oversight. I would rather the CI tell me than a reader.

## What this makes possible

The other reason for the migration is that I want to build tools for Ontologic, and tools need a real codebase to be developed against.

The first one is `@ontologic/domain-explorer`. It reads an Ontologic codebase with the TypeScript compiler API and produces a single self-contained HTML page: your aggregates, the entities and value objects they contain, the events they emit, the use cases that drive them — navigable, with a graph view. It also reports where the model looks inconsistent: an invariant that is declared but never attached, a use case whose error union has been widened to `Error`.

It is not released. It is in the repository, at version 0.1.0, and I want to run it against real domains before putting it on npm. But it exists at all because there is now a non-trivial Ontologic application in the same workspace to point it at — one that is guaranteed to be current, because the build says so.

That is the general shape of it: the monorepo is not the interesting part, it is the thing that makes the interesting parts checkable.

## What changes for you

If you use Ontologic, nothing. Same package, same unscoped `ontologic` name, same install, still zero runtime dependencies. The library source did not change in the migration.

What changes is where to look. The example now lives at [`packages/library-example`](https://github.com/SachaCR/ontologic/tree/main/packages/library-example). The old standalone repository is archived and points here, so existing links still lead somewhere useful.

If you try the example against your own domain and something in it does not hold up, [tell me on GitHub](https://github.com/SachaCR/ontologic) — that is now a bug I can reproduce with a build.

---

`npm install ontologic`
