# @ontologic/domain-explorer

Reads a codebase built on [Ontologic](https://ontologic.site) and generates a single
self-contained HTML page documenting its domain model.

```bash
npx @ontologic/domain-explorer ./src/domain --out domain.html
```

One file. Stylesheet, script and data are all inlined, so it opens from disk, survives
being emailed, and works in a sandbox that blocks every external host.

## What it finds

Detection keys on base classes and type arguments, never on filenames — so it works
regardless of whether you keep use cases in `useCases/` or `use-cases/`, declare your event
union in its own file or inline, or put one error per file or ten.

| Concept | Detected by |
| --- | --- |
| Aggregates and sub-entities | `extends DomainEntity<State>` |
| Value objects | `extends ValueObject<State>` |
| Domain events | `extends DomainEvent<Name, Version, Payload>` |
| Typed errors | `extends DomainError<Name, Context>` |
| Invariants | `new BaseDomainInvariant<State>(description, predicate)` |
| Repositories | `extends InMemoryRepository<E, Ev>`, or an interface extending `Repository<E, Ev>` |
| Use cases | `implements UseCase<Action, Output, Errors>` |
| Commands and queries | `extends Command<Name, Payload>` / `extends Query<Name, Payload>` |

It also resolves the relationships between them: which method emits which event, which
errors a behaviour can return, what an aggregate contains, which repositories a use case
reads from versus writes to, and whether a use case is driven by a command or a query.

## Two views

**Overview** — how many of each concept the codebase has, and the findings below. Every
count opens what it counted, and from there you drill down one level at a time: an
aggregate, then what it holds, then its behaviours, then the events and errors each
behaviour produces.

Each aggregate and entity page opens on a diagram of the aggregate it belongs to — the
root, what hangs off it, and the events those produce. Errors are left out; the diagram is
about structure. On a contained entity the diagram is its root's, with the entity marked.
A box standing for a union of interchangeable types unfolds when you click it.

Every object has exactly one page, whichever link you followed to get there. The kind of
the thing decides what the page shows, never the address it was reached by.

**Use cases** — every command and query, each with its flow drawn as an event-storming
board: the happy path and each failure path, with the events or errors they end on.

## Findings

The same pass that builds the model reports where a codebase contradicts itself:

| Code | Meaning |
| --- | --- |
| `error-missing-set-prototype` | A `DomainError` subclass whose constructor omits `Object.setPrototypeOf`, so `instanceof` is `false` for it at runtime |
| `event-missing-from-union` | An event that is emitted but absent from any event union type, making it invisible to repositories and listeners typed on that union |
| `invariant-never-attached` | An invariant declared but wired to no entity — it looks like protection and provides none |
| `use-case-error-union-erased` | A use case declaring `Result<_, Error>`, so callers cannot handle its failures exhaustively |
| `use-case-not-marked` | A function that reads and writes aggregates like a use case but does not implement `UseCase<…>`, so its action cannot be determined |
| `legacy-invariant-attachment` | Invariants passed as a positional third constructor argument, the pre-1.7 API |

## Usage

```
domain-explorer <path...> [options]
domain-explorer --project <tsconfig.json> [options]

  -o, --out <file>       Write self-contained HTML documentation
  -p, --project <file>   Analyse the files of a tsconfig instead of scanning paths
      --json <file>      Write the extracted model as JSON
      --include-tests    Include __tests__ directories (excluded by default)
  -h, --help             Show this message
```

`--project` gives the fullest picture, since it analyses exactly what your build does.
Passing paths instead scans them directly, which is useful for documenting one bounded
context out of a larger repository.

`--json` writes the extracted model as plain data, if you would rather feed it to something
other than the bundled renderer.

## Programmatic use

```ts
import { extractModel, renderHtml } from "@ontologic/domain-explorer";

const model = extractModel({ paths: ["./src/domain"] });
console.log(model.findings);

writeFileSync("domain.html", renderHtml(model));
```

Extraction and rendering are deliberately separate: the model is plain serialisable data,
so it can be asserted on in tests, diffed between versions, or rendered some other way.

## Notes

**It does not need your dependencies installed.** Detection matches on written syntax and
only enriches with the type checker where that resolves, so a codebase with no
`node_modules` still produces a complete model.

**Use cases are identified exactly, not guessed.** A use case declares
`implements UseCase<Action, Output, Errors>`, which is a written heritage clause carrying
its own type arguments — read the same way repository ports are. The action is then
resolved to the `Command` or `Query` it extends, so whether an operation changes state is
taken from the type system rather than inferred from whether the body happens to call
`save`.

Codebases predating that interface are not silently reported as having no use cases:
functions that look like one are surfaced as `use-case-not-marked` findings, with the file
and line to migrate.

**Tooling directories are skipped.** Anything under a dot-directory is ignored, so a
project that has run `ontologic init-agents` does not get the shipped reference aggregates
documented as its own domain.

## License

MIT
