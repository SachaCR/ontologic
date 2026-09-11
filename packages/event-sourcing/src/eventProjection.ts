import {
  CreationEventNotFoundError,
  CreationEventReplayedError,
  InvalidProjectedStateError,
  NoCreationEventError,
  UnknownEventApplierError,
} from "./errors";
import {
  type CreationEventApplier,
  type EventApplier,
  type EventProjectionConfig,
  type EventProjectionInterface,
  type Snapshot,
  type SourceEvent,
} from "./interfaces";
import { validateJsonValue } from "./json";

/**
 * Rebuilds a state by folding a stream of events onto a snapshot.
 *
 * Built from one config carrying an applier per event, then folded with
 * {@link EventProjection.apply}. The projection is pure and holds no state of
 * its own: a snapshot and a list of events go in, a new `{ state, version }`
 * comes out. The same projection can therefore rebuild the same stream from any
 * starting point, which is what makes it cheap to test.
 *
 * ```ts
 * const cart = new EventProjection<CartState, CartEvent, "CART_CREATED">({
 *   name: "Cart",
 *   creationEvent: "CART_CREATED",
 *   appliers: {
 *     CART_CREATED: ({ event }) => …,          // no state yet to receive
 *     ITEM_ADDED: ({ event, state }) => …,
 *   },
 * });
 * ```
 *
 * Every applier is declared the same way. The creation event's is the one that
 * receives no `state`, because at the first event there is none — asking for it
 * does not compile. Because `appliers` is a mapped type over the whole event
 * union, a forgotten applier is a compile error rather than a surprise at fold
 * time.
 *
 * It has no opinion about what the state *is*. Fold an aggregate's own events
 * back into the write-side state its invariants are checked against; fold a
 * stream into a read model that answers a query; fold anything whose current
 * value is a function of the facts that produced it. Nothing here knows about
 * `ontologic`, and the package depends on it in neither direction.
 *
 * A read model usually has no creation event, since nothing "creates" a view.
 * Leave `creationEvent` off, and every applier becomes an ordinary one; start
 * the fold from a snapshot of the model's empty shape:
 *
 * ```ts
 * const { state, version } = projection.apply({
 *   snapshot: { state: { booksPerAuthor: {} }, version: 0 },
 *   events: newEvents,
 * });
 * ```
 *
 * Extend this class to create your own projections.
 *
 * @typeParam State - The shape being rebuilt. Must be JSON-compatible.
 * @typeParam Event - The events this projection can fold.
 * @typeParam CreationName - The creation event's name, or `never` when there
 * is none. Written out explicitly because TypeScript cannot infer one type
 * argument while others are given.
 */
export class EventProjection<
  State,
  Event extends SourceEvent,
  CreationName extends Event["name"] = never,
> implements EventProjectionInterface<State, Event> {
  /**
   * Every applier, the creation one included. It is stored under the ordinary
   * `EventApplier` type because the two differ only in whether they read
   * `state`, and a function that ignores an argument is compatible with one
   * that takes it. The config type is what keeps the distinction honest at the
   * declaration site.
   */
  #appliers: Map<Event["name"], EventApplier<Event, State>>;
  #projectionName: string;
  #creationEventName: Event["name"] | undefined;

  constructor(config: EventProjectionConfig<State, Event, CreationName>) {
    this.#projectionName = config.name;
    this.#appliers = new Map<Event["name"], EventApplier<Event, State>>();

    // The mapped type has already guaranteed one entry per event name; the
    // casts only restate for the runtime what the config type proved.
    for (const [eventName, applier] of Object.entries(config.appliers)) {
      this.#appliers.set(
        eventName as Event["name"],
        applier as EventApplier<Event, State>,
      );
    }

    this.#creationEventName = config.creationEvent;
  }

  /**
   * Applies a list of events to an entity's state.
   * @returns The new state and the new version of the entity.
   */
  apply(params: {
    /**
     * The starting point to fold events onto. Omit it and the state is built
     * from the creation event, which must then be the first event in the array.
     *
     * Throws if omitted and the config named no `creationEvent`, or if omitted
     * and the stream does not start with it. Pass one and the stream must *not*
     * contain the creation event at all.
     */
    snapshot?: Snapshot<State>;

    /**
     * The events to apply.
     */
    events: Event[];
  }): {
    /**
     * The new state of the entity.
     */
    state: State;

    /**
     * The new version of the entity.
     */
    version: number;
  } {
    const { snapshot, events } = params;

    let newState: State;
    let newVersion: number;

    // Presence, not truthiness. A snapshot whose state is `0`, `""`, `false`
    // or `null` is a legitimate snapshot — `State` is unconstrained and all of
    // those are JSON values — and testing it for falsiness silently discarded
    // it, sending a counter at zero down the creation path to either throw
    // "Initial event not found" or re-initialise and return a fabricated
    // state and version.
    const startsFromNothing = snapshot === undefined;

    if (snapshot === undefined) {
      if (this.#creationEventName === undefined) {
        throw new NoCreationEventError(this.#projectionName);
      }

      const first = events[0];

      if (first === undefined || first.name !== this.#creationEventName) {
        throw new CreationEventNotFoundError({
          projectionName: this.#projectionName,
          expected: String(this.#creationEventName),
          received: first?.name,
        });
      }

      // The creation applier lives in the same map as the others; only its
      // signature differs, and the config type is what enforced that. Here it
      // is called with no state, because there is none yet.
      const creationApplier = this.#appliers.get(first.name) as unknown as
        | CreationEventApplier<Event, State>
        | undefined;

      if (creationApplier === undefined) {
        throw new UnknownEventApplierError({
          projectionName: this.#projectionName,
          eventName: first.name,
          eventIndex: 0,
          streamLength: events.length,
        });
      }

      // Nothing to validate on the way in and nothing to clone: this state is
      // built here and nobody else holds a reference to it. The check after
      // the fold covers what the applier returned.
      newState = creationApplier({ event: first });
      newVersion = 1;
    } else {
      const incoming = validateJsonValue(snapshot.state);

      if (!incoming.isValid) {
        throw new InvalidProjectedStateError({
          projectionName: this.#projectionName,
          stage: "initial",
          code: incoming.code,
          path: incoming.path,
          reason: incoming.reason,
        });
      }

      // Safe to clone unchecked: the check above already rejects everything
      // `structuredClone` would refuse. The clone is what stops an applier
      // mutating the caller's own snapshot object.
      newState = structuredClone(snapshot.state);
      newVersion = snapshot.version;
    }

    for (const [index, event] of events.entries()) {
      if (index === 0 && startsFromNothing) {
        // Already folded above, as the creation event.
        continue;
      }

      if (event.name === this.#creationEventName) {
        throw new CreationEventReplayedError({
          projectionName: this.#projectionName,
          eventName: event.name,
          eventIndex: index,
        });
      }

      const applier = this.#appliers.get(event.name);

      if (!applier) {
        throw new UnknownEventApplierError({
          projectionName: this.#projectionName,
          eventName: event.name,
          eventIndex: index,
          streamLength: events.length,
        });
      }

      newState = applier({
        event: event,
        state: newState,
      });

      newVersion = newVersion + 1;
    }

    const projected = validateJsonValue(newState);

    if (!projected.isValid) {
      throw new InvalidProjectedStateError({
        projectionName: this.#projectionName,
        stage: "projected",
        code: projected.code,
        path: projected.path,
        reason: projected.reason,
      });
    }

    return {
      state: newState,
      version: newVersion,
    };
  }

  /**
   * The name this projection was constructed with, as it appears in the
   * messages and on the `projectionName` field of anything it throws.
   */
  name(): string {
    return this.#projectionName;
  }
}
