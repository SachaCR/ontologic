# @ontologics/event-sourcing

[![npm](https://img.shields.io/npm/v/@ontologics/event-sourcing)](https://www.npmjs.com/package/@ontologics/event-sourcing)
[![node](https://img.shields.io/node/v/@ontologics/event-sourcing)](https://nodejs.org)
[![license](https://img.shields.io/npm/l/@ontologics/event-sourcing)](https://github.com/SachaCR/ontologic/blob/main/packages/event-sourcing/LICENSE)

Event sourcing for any state that is a function of the facts that produced it. Declare one applier
per event, and rebuild the state by folding its event stream from the beginning, or onto a snapshot
you already hold.

It has no opinion about what the state is: an aggregate rebuilt from its own events, a read model
that projects a stream into the shape a query wants, a running total. The package is standalone and
depends on nothing. It pairs well with [`ontologic`](https://www.npmjs.com/package/ontologic) but knows
nothing about it, so it works just as well on events from anywhere else.

```bash
pnpm add @ontologics/event-sourcing
```

## Quick start

```ts
import { EventProjection, type SourceEvent } from "@ontologics/event-sourcing";

interface BookAdded extends SourceEvent {
  name: "BOOK_ADDED";
  payload: { bookId: string; title: string };
}

interface BookBorrowed extends SourceEvent {
  name: "BOOK_BORROWED";
  payload: { memberId: string };
}

interface BookReturned extends SourceEvent {
  name: "BOOK_RETURNED";
  payload: { returnedAt: string };
}

type BookEvent = BookAdded | BookBorrowed | BookReturned;

interface BookState {
  bookId: string;
  title: string;
  borrowedBy: string | null;
}

export class BookProjection extends EventProjection<BookState, BookEvent> {
  constructor() {
    super("Book");

    // The one event that brings a book into existence: no prior state to fold onto.
    this.mountCreationEventApplier("BOOK_ADDED", ({ event }) => ({
      bookId: event.payload.bookId,
      title: event.payload.title,
      borrowedBy: null,
    }));

    this.mountEventApplier("BOOK_BORROWED", ({ event, state }) => ({
      ...state,
      borrowedBy: event.payload.memberId,
    }));

    this.mountEventApplier("BOOK_RETURNED", ({ state }) => ({
      ...state,
      borrowedBy: null,
    }));
  }
}
```

`event` is narrowed to the event you mounted the applier for, so `event.payload` is typed per event
rather than as the union.

Project a whole stream:

```ts
const books = new BookProjection();

const { state, version } = books.apply({
  events: [
    {
      name: "BOOK_ADDED",
      version: 1,
      payload: { bookId: "b-1", title: "Dune" },
    },
    { name: "BOOK_BORROWED", version: 1, payload: { memberId: "m-7" } },
  ],
});

// state   → { bookId: "b-1", title: "Dune", borrowedBy: "m-7" }
// version → 2
```

Or catch a snapshot up with the events recorded since:

```ts
const next = books.apply({
  snapshot: { state, version },
  events: [
    {
      name: "BOOK_RETURNED",
      version: 1,
      payload: { returnedAt: "2026-09-10" },
    },
  ],
});

// next.state   → { bookId: "b-1", title: "Dune", borrowedBy: null }
// next.version → 3
```

A projection holds no state of its own. `apply` takes a snapshot and returns a new one, so one
instance can rebuild any number of streams, concurrently and in any order. A
test can replay the same stream from any starting point.

## Snapshots and versions

`version` counts the events folded into a state, so it doubles as the entity's optimistic-locking
token: read a snapshot at version 12, and a write is safe only while the stream is still 12 long.

Omit `snapshot` and the fold starts from nothing: the first event must be the creation event, and
the returned version counts from zero. Pass one and every event in `events` is applied on top of
it, with `version` counting on from `snapshot.version`.

The creation event is deliberately _not_ mountable as an ordinary applier. It takes no incoming
state, so its applier receives only `{ event }`. As a result, replaying a stream that still
contains its creation event on top of an existing snapshot is an error rather than a silent
re-initialization; see the table below.

## Folding into a read model

Nothing in a projection assumes the state is an aggregate. A read model is the same fold with a
different shape on the other side. The only difference is that no event _creates_ it, so there is
no creation applier to mount.

Declare the events the model is interested in:

```ts
/** memberId → how many books they have borrowed. */
type BorrowCounts = Record<string, number>;

const borrowCounts = new EventProjection<BorrowCounts, BookBorrowed>(
  "BorrowCounts",
);

borrowCounts.mountEventApplier("BOOK_BORROWED", ({ event, state }) => ({
  ...state,
  [event.payload.memberId]: (state[event.payload.memberId] ?? 0) + 1,
}));

// Whatever your store handed you since the last run.
declare const eventsSinceLastRun: BookEvent[];

// `apply` accepts `BookBorrowed[]` here, so the compiler will not let you pass
// the raw stream. Narrowing the generic turns filtering into an obligation
// instead of something to remember.
const borrows = eventsSinceLastRun.filter(
  (event): event is BookBorrowed => event.name === "BOOK_BORROWED",
);

// Version 0 with an empty shape is the read model's starting point.
const { state: counts, version: folded } = borrowCounts.apply({
  snapshot: { state: {}, version: 0 },
  events: borrows,
});
```

Where the selection happens is a choice worth making deliberately. Narrow the generic as above and
the type checker forces the caller to filter, which is also the only arrangement that makes
`apply`'s refusal of an unmounted event unreachable rather than a runtime risk. Widen it to the full
union instead and you have to mount `({ state }) => state` for every event you mean to ignore: more
code, and a list that grows with the stream rather than with the model, in exchange for every event
the model sees being visible in one place.

One thing not to assume: `version` counts the events this projection folded, so on a filtered stream
it is not a position in that stream. Fold two of five events and it returns 2. If you need to resume
where you left off, persist the stream offset yourself alongside the state.

## Errors

Every one of these is a programmer error: an applier that was never mounted, a stream that does not
begin where it claims to, a state that could not survive being stored. So `apply` throws rather
than returning them. Each is a class carrying the context needed to fix the bug, and each sets
`name` to a stable discriminant you can branch on without parsing a message.

| Class                         | `name`                      | Extra fields                              | Cause                                                                                                                  |
| ----------------------------- | --------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `NoCreationEventApplierError` | `NO_CREATION_EVENT_APPLIER` | —                                         | No `snapshot`, and no creation event applier was mounted.                                                              |
| `CreationEventNotFoundError`  | `CREATION_EVENT_NOT_FOUND`  | `expected`, `received`                    | No `snapshot`, and `events` is empty or does not start with the creation event.                                        |
| `UnknownEventApplierError`    | `UNKNOWN_EVENT_APPLIER`     | `eventName`, `eventIndex`, `streamLength` | An event has no applier mounted for its name. Also what you get for the creation event when a `snapshot` _was_ passed. |
| `InvalidProjectedStateError`  | `INVALID_PROJECTED_STATE`   | `stage`, `code`, `path`, `reason`         | A state is not JSON-compatible. `stage` is `"initial"` or `"projected"`.                                               |

All four extend `EventSourcingError`, which carries `projectionName` and prefixes the message with it.

`InvalidProjectedStateError` carries the validator's full diagnosis, so you get the offending
location rather than only the fact of failure:

```ts
import { InvalidProjectedStateError } from "@ontologics/event-sourcing";

try {
  books.apply({ snapshot: { state, version }, events: [] });
} catch (error) {
  if (error instanceof InvalidProjectedStateError) {
    console.error(error.code); // e.g. "non-plain-object"
    console.error(error.path); // e.g. "$.borrowedAt"
    console.error(error.stage); // "initial" or "projected"
  }
}
```

## State must be JSON-compatible

State is checked before and after the fold, and deep-cloned in between, so an applier cannot leak a
mutation back into the caller's snapshot. That constrains what a state may hold. It must survive a
round trip through `JSON.parse(JSON.stringify(x))` unchanged.

Rejected: `undefined`, functions, symbols, `bigint`, `NaN` and the infinities, symbol keys,
circular references, and class instances or built-ins such as `Map`, `Set`, `RegExp` and `Date`.
Store a `Date` as an ISO string and a `Map` as a plain object or an array of entries.

Accepted, by design: sparse arrays (holes come back as `null`) and null-prototype objects.

## API

### `class EventProjection<State, Event extends SourceEvent>`

| Member                                          | Description                                                                                                      |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `constructor(projectionName: string)`           | Names this projection, so its errors can say which one complained.                                               |
| `mountEventApplier(eventName, applier)`         | Registers `({ event, state }) => State` for one event name. Mounting twice for the same name replaces the first. |
| `mountCreationEventApplier(eventName, applier)` | Registers `({ event }) => State` for the event that creates the entity.                                          |
| `apply({ snapshot?, events })`                  | Folds `events` and returns `{ state, version }`.                                                                 |
| `name()`                                        | The name given to the constructor.                                                                               |

### `interface SourceEvent`

The minimum an event must provide: `name`, `version` and `payload`. Appliers are matched on `name`
alone; `version` describes the event's own shape, and the entity version in the result is derived
by counting the events applied.

Any object of that shape will do, wherever it came from. `ontologic`'s `DomainEvent` happens to
satisfy it structurally. It exposes `name`, `version` and `payload` as getters. Though nothing in
this package depends on that, and if you are reading events back through `ontologic`'s repository
you will be unwrapping `EventWithMetadata` first:

```ts
// `ontologic`'s repository hands back each event wrapped with its metadata,
// so unwrap before folding.
declare const stored: { event: BookEvent; metadata: { offset: number } }[];

const { state: rebuilt } = books.apply({
  events: stored.map((wrapped) => wrapped.event),
});
```

### `interface Snapshot<State>`

`{ state, version }` what `apply` accepts as a starting point and what it returns.

### Errors

`EventSourcingError` and its four subclasses. See [Errors](#errors) above.

### The JSON validator

`validateJsonValue(value)` returns `{ isValid: true }` or `{ isValid: false, code, reason, path }`;
`isJsonValue(value)` is the boolean form. `JsonValue`, `JsonValidation` and `JsonInvalidCode` are
exported alongside them. This is the same check `apply` runs, exposed so you can validate a state
before handing it over rather than after.

## Status

Early. `EventProjection` is the whole public API today; the event store is still yours to provide. Expect additions rather
than changes to what is here, but the package is pre-1.0 and the surface is not frozen.
