# Ontologic

Monorepo for [Ontologic](https://ontologic.site), a TypeScript toolkit for building
software that speaks your domain's language, and the tools built around it.

## Packages

| Package | Published as | What it is |
| --- | --- | --- |
| [`packages/ontologic`](packages/ontologic) | [`ontologic`](https://www.npmjs.com/package/ontologic) | The library. Domain entities, invariants, domain events, the Result pattern, repositories, the event bus and outbox relay, and typed resumable workflows. Zero runtime dependencies. |
| [`packages/domain-explorer`](packages/domain-explorer) | `@ontologic/domain-explorer` | Reads an Ontologic codebase and generates a single self-contained HTML page documenting its domain model — aggregates, value objects, events, typed errors, invariants, repositories and use cases. |
| [`packages/library-example`](packages/library-example) | not published | A NestJS library-management app demonstrating the library on a real domain, and the source for the articles under its `docs/`. |
| [`website`](website) | ontologic.site | The documentation site (Docusaurus), including the `llms.txt` generated from it. |

Start with [`packages/ontologic`](packages/ontologic) if you are here for the library
itself, or [ontologic.site](https://ontologic.site) for the guides.

## Working in this repo

pnpm workspaces driven by [turbo](https://turbo.build). Everything runs from the root:

```bash
pnpm install
pnpm build          # every package, in dependency order
pnpm test           # every suite
pnpm check:agents   # type-checks the agent skill templates against the library
```

Scope a command to one package with `--filter`:

```bash
pnpm --filter ontologic test
pnpm --filter @ontologic/domain-explorer build
pnpm --filter website build
```

Each package writes its test report to `reports/index.html`; `pnpm --filter <pkg> test:report`
runs the suite and serves it.

## Conventions

[`packages/ontologic/AGENTS.md`](packages/ontologic/AGENTS.md) documents how to write code
*with* the library — the folder layout, the entity and event patterns, and the rule that
domain failures are returned while technical failures are thrown. It ships inside the npm
package, so it describes the library's conventions rather than this repository's.

Two things differ between packages and are deliberate:

- `packages/library-example` writes its tests as Gherkin scenarios (`describe("Given …")`,
  `it("Then …")`); the library's own tests do not.
- `packages/domain-explorer` runs without coverage, because its tests drive the TypeScript
  compiler and instrumenting it costs far more than the coverage is worth.

## Releasing

The **Release package** workflow (`workflow_dispatch`) bumps and publishes a single
package. It takes the package name and a release type, so `ontologic` and
`@ontologic/domain-explorer` release independently.

## License

MIT
