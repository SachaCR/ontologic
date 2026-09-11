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

export class BookProjection extends EventProjection<
  BookState,
  BookEvent,
  "BOOK_ADDED"
> {
  constructor() {
    super({
      name: "Book",

      // Which event brings a book into existence. Naming it is what lets a
      // fold start from nothing, and what stops a stream replaying it onto a
      // book that already exists.
      creationEvent: "BOOK_ADDED",

      // One entry per event. Leave one out and this will not compile.
      appliers: {
        // The creation event's applier is declared like any other. The only
        // difference is that it receives no `state` — at the first event there
        // is none, and asking for it does not compile.
        BOOK_ADDED: ({ event }) => ({
          bookId: event.payload.bookId,
          title: event.payload.title,
          borrowedBy: null,
        }),

        BOOK_BORROWED: ({ event, state }) => ({
          ...state,
          borrowedBy: event.payload.memberId,
        }),

        BOOK_RETURNED: ({ state }) => ({
          ...state,
          borrowedBy: null,
        }),
      },
    });
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

The creation event's applier is declared alongside the others but receives only `{ event }`: at the
first event there is no state to hand it. Naming it in `creationEvent` also lets `apply` refuse a
stream that replays it onto an existing snapshot, which would otherwise re-create the state and
hand back a plausible version — a wrong answer that looks right. That is `CreationEventReplayedError`
in the table below.

## Folding into a read model

Nothing in a projection assumes the state is an aggregate. A read model is the same fold with a
different shape on the other side. The only difference is that no event _creates_ it, so there is
no `creationEvent` to name, and so every applier is an ordinary one.

Declare the events the model is interested in:

```ts
/** memberId → how many books they have borrowed. */
type BorrowCounts = Record<string, number>;

// No `creationEvent`: nothing brings a read model into existence, so every
// applier is an ordinary one and `apply` needs a snapshot to fold onto.
const borrowCounts = new EventProjection<BorrowCounts, BookBorrowed>({
  name: "BorrowCounts",
  appliers: {
    BOOK_BORROWED: ({ event, state }) => ({
      ...state,
      [event.payload.memberId]: (state[event.payload.memberId] ?? 0) + 1,
    }),
  },
});

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

| Class                        | `name`                     | Extra fields                              | Cause                                                                                                                 |
| ---------------------------- | -------------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `NoCreationEventError`       | `NO_CREATION_EVENT`        | —                                         | No `snapshot`, and the config named no `creationEvent` to start from.                                                 |
| `CreationEventNotFoundError` | `CREATION_EVENT_NOT_FOUND` | `expected`, `received`                    | No `snapshot`, and `events` is empty or does not start with the creation event.                                       |
| `CreationEventReplayedError` | `CREATION_EVENT_REPLAYED`  | `eventName`, `eventIndex`                 | The creation event turned up where a state already exists: on top of a snapshot, or partway through a stream.         |
| `UnknownEventApplierError`   | `UNKNOWN_EVENT_APPLIER`    | `eventName`, `eventIndex`, `streamLength` | An event has no applier declared for its name. Unreachable for well-typed code; fires for a stream that predates one. |
| `InvalidProjectedStateError` | `INVALID_PROJECTED_STATE`  | `stage`, `code`, `path`, `reason`         | A state is not JSON-compatible. `stage` is `"initial"` or `"projected"`.                                              |

All five extend `EventSourcingError`, which carries `projectionName` and prefixes the message with it.

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

| Member                         | Description                                                                                                                                        |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `constructor(config)`          | Takes `{ name, creationEvent?, appliers }`. Everything is fixed at construction; there is no mounting afterwards.                                  |
| `config.name`                  | Names this projection, so its errors can say which one complained.                                                                                 |
| `config.appliers`              | One `({ event, state }) => State` per event name. Exhaustive: a missing entry is a compile error.                                                  |
| `config.creationEvent`         | The name of the event that creates the state. Its applier lives in `appliers` like any other but receives only `{ event }`. Omit for a read model. |
| `apply({ snapshot?, events })` | Folds `events` and returns `{ state, version }`.                                                                                                   |
| `name()`                       | The name given to the constructor.                                                                                                                 |

### `interface SourceEvent`

The minimum an event must provide: `name`, `version` and `payload`.

Appliers are keyed on `name` alone, so `version` is never read by the projection. It is there for
_your_ appliers: when a union carries two versions of the same event, `Extract` on the name hands
the applier both, and `version` is the discriminant that narrows the payload.

```ts
type BookAddedV1 = {
  name: "BOOK_ADDED";
  version: 1;
  payload: { title: string };
};

type BookAddedV2 = {
  name: "BOOK_ADDED";
  version: 2;
  payload: { title: string; isbn: string };
};

type CatalogEvent = BookAddedV1 | BookAddedV2;
type CatalogState = { title: string; isbn: string | null };

const catalog = new EventProjection<CatalogState, CatalogEvent>({
  name: "Catalog",
  appliers: {
    // Both versions land in this one applier, because the map is keyed on the
    // name. `version` is the discriminant that narrows the payload, so the
    // older shape stays readable without a cast.
    BOOK_ADDED: ({ event, state }) => ({
      ...state,
      title: event.payload.title,
      isbn: event.version === 2 ? event.payload.isbn : null,
    }),
  },
});
```

That is also why it is required rather than optional: an event with no version cannot be evolved
later without breaking every reader. The entity version that `apply` returns is a different number
entirely, derived by counting the events folded.

There is deliberately no `entityId`, and no other notion of stream identity. A projection folds the
events it is handed, in the order it is handed them; deciding which events belong together is the
caller's job. That is what lets the same primitive rebuild one aggregate from its own stream and a
read model from many — a read model legitimately folds events from thousands of entities, so there
is no identity the library could check for you.

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

Early, but the shape is settled. `EventProjection` is the whole public API today and the event store
is still yours to provide.

Three questions came up repeatedly and are now decided, so they are worth stating rather than
leaving as omissions a reader has to guess at:

| Question                                                        | Decision                                                                                                                   |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| How are appliers registered?                                    | In one config object at construction, checked exhaustively. There is no mounting afterwards.                               |
| Why must every event carry a `version` the library never reads? | So an applier can narrow a payload when one event name has more than one shape.                                            |
| Why is there no `entityId`?                                     | Stream identity belongs to the caller. A read model folds many entities' events, so there is nothing universal to enforce. |

Expect additions rather than changes from here. The package is still pre-1.0, so that is an
intention rather than a guarantee, but the surface above is the one meant to last.
