# @ontologics/event-sourcing

[![npm](https://img.shields.io/npm/v/@ontologics/event-sourcing)](https://www.npmjs.com/package/@ontologics/event-sourcing)
[![node](https://img.shields.io/node/v/@ontologics/event-sourcing)](https://nodejs.org)
[![license](https://img.shields.io/npm/l/@ontologics/event-sourcing)](https://github.com/SachaCR/ontologic/blob/main/packages/event-sourcing/LICENSE)

Event sourcing for entities modelled with [Ontologic](https://ontologic.site). Declare one applier
per event, and rebuild an entity's state by folding its stream — from the beginning, or onto a
snapshot you already hold.

A companion package, so that [`ontologic`](https://www.npmjs.com/package/ontologic) itself stays
free of runtime dependencies:

```bash
pnpm add @ontologics/event-sourcing ontologic
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

Fold a whole stream:

```ts
const books = new BookProjection();

const { state, version } = books.apply({
  events: [
    { name: "BOOK_ADDED", version: 1, payload: { bookId: "b-1", title: "Dune" } },
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
    { name: "BOOK_RETURNED", version: 1, payload: { returnedAt: "2026-09-10" } },
  ],
});

// next.state   → { bookId: "b-1", title: "Dune", borrowedBy: null }
// next.version → 3
```

A projection holds no state of its own. `apply` takes a snapshot and returns a new one, so one
instance can rebuild any number of entities of that type, concurrently and in any order — and a
test can replay the same stream from any starting point.

## Snapshots and versions

`version` counts the events folded into a state, so it doubles as the entity's optimistic-locking
token: read a snapshot at version 12, and a write is safe only while the stream is still 12 long.

Omit `snapshot` and the fold starts from nothing: the first event must be the creation event, and
the returned version counts from zero. Pass one and every event in `events` is applied on top of
it, with `version` counting on from `snapshot.version`.

The creation event is deliberately *not* mountable as an ordinary applier — it takes no incoming
state, so its applier receives only `{ event }`. As a result, replaying a stream that still
contains its creation event on top of an existing snapshot is an error rather than a silent
re-initialization; see the table below.

## Errors

`apply` throws a plain `Error` in these cases:

| Message | Cause |
| --- | --- |
| `No creation event applier configured` | No `snapshot`, and no creation event applier was mounted. |
| `Initial event not found` | No `snapshot`, and `events` is empty or does not start with the creation event. |
| `Unknown event applier: <name>` | An event has no applier mounted for its name. Also what you get for the creation event when a `snapshot` *was* passed. |
| `The initial state is not JSON compatible` | The state in the snapshot, or the state the creation applier returned, is not JSON-compatible. |
| `The new state is not JSON compatible` | An applier returned a state that is not JSON-compatible. |

## State must be JSON-compatible

State is checked before and after the fold, and deep-cloned in between, so an applier cannot leak a
mutation back into the caller's snapshot. That constrains what a state may hold — it must survive a
round trip through `JSON.parse(JSON.stringify(x))` unchanged.

Rejected: `undefined`, functions, symbols, `bigint`, `NaN` and the infinities, symbol keys,
circular references, and class instances or built-ins such as `Map`, `Set`, `RegExp` and `Date`.
Store a `Date` as an ISO string and a `Map` as a plain object or an array of entries.

Accepted, by design: sparse arrays (holes come back as `null`) and null-prototype objects.

## API

### `class EventProjection<State, Event extends SourceEvent>`

| Member | Description |
| --- | --- |
| `constructor(entityName: string)` | Names the entity this projection rebuilds. |
| `mountEventApplier(eventName, applier)` | Registers `({ event, state }) => State` for one event name. Mounting twice for the same name replaces the first. |
| `mountCreationEventApplier(eventName, applier)` | Registers `({ event }) => State` for the event that creates the entity. |
| `apply({ snapshot?, events })` | Folds `events` and returns `{ state, version }`. |
| `entityName` | The name given to the constructor. |

### `interface SourceEvent`

The minimum an event must provide: `name`, `version` and `payload`. Appliers are matched on `name`
alone; `version` describes the event's own shape, and the entity version in the result is derived
by counting the events applied.

Core's `DomainEvent` satisfies this structurally, so events from an Ontologic domain can be folded
without translation.

### `interface Snapshot<State>`

`{ state, version }` — what `apply` accepts as a starting point and what it returns.

## Status

Early. `EventProjection` is the whole public API today; the event store and stream-append side of
the package is not written yet, so persistence is still yours to provide. Expect additions rather
than changes to what is here, but the package is pre-1.0 and the surface is not frozen.
