import {
  CreationEventNotFoundError,
  InvalidProjectedStateError,
  NoCreationEventApplierError,
  UnknownEventApplierError,
} from "./errors";
import {
  type CreationEventApplier,
  type EventApplier,
  type EventProjectionInterface,
  type Snapshot,
  type SourceEvent,
} from "./interfaces";
import { validateJsonValue } from "./json";

/**
 * Rebuilds a state by folding a stream of events onto a snapshot.
 *
 * Mount one applier per event name, then call {@link EventProjection.apply}.
 * The projection is pure and holds no state of its own: a snapshot and a list
 * of events go in, a new `{ state, version }` comes out. The same projection
 * can therefore rebuild the same stream from any starting point, which is what
 * makes it cheap to test.
 *
 * It has no opinion about what the state *is*. Fold an aggregate's own events
 * back into the write-side state its invariants are checked against; fold a
 * stream into a read model that answers a query; fold anything whose current
 * value is a function of the facts that produced it. Nothing here knows about
 * `ontologic`, and the package depends on it in neither direction.
 *
 * A read model usually has no creation event, since nothing "creates" a view.
 * Start it from a snapshot of its empty shape instead:
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
 */
export class EventProjection<
  State,
  Event extends SourceEvent,
> implements EventProjectionInterface<State, Event> {
  #appliers: Map<Event["name"], EventApplier<Event, State>>;
  #projectionName: string;
  #creationEventApplier: CreationEventApplier<Event, State> | undefined;
  #creationEventName: Event["name"] | undefined;

  constructor(
    /**
     * A name for this projection, used to say which one complained when it
     * throws. Whatever you are rebuilding: `"Cart"`, `"BorrowCounts"`.
     */
    projectionName: string,
  ) {
    this.#projectionName = projectionName;
    this.#appliers = new Map<Event["name"], EventApplier<Event, State>>();
  }

  /**
   * Mounts an applier for a specific event name. If you mount two appliers for the same event name. The first one will be replaced.
   * @param eventName - The name of the event.
   * @param eventApplier - The applier for the event.
   */
  mountEventApplier<EventName extends Event["name"]>(
    eventName: EventName,
    eventApplier: EventApplier<Extract<Event, { name: EventName }>, State>,
  ): void {
    this.#appliers.set(eventName, eventApplier as EventApplier<Event, State>);
  }

  /**
   * Mounts the applier that will be used to create the initial state of the entity.
   * @param eventName - The name of the creation event.
   * @param eventApplier - The applier for the creation event.
   */
  mountCreationEventApplier<EventName extends Event["name"]>(
    eventName: EventName,
    eventApplier: CreationEventApplier<
      Extract<Event, { name: EventName }>,
      State
    >,
  ): void {
    this.#creationEventApplier = eventApplier as CreationEventApplier<
      Event,
      State
    >;
    this.#creationEventName = eventName;
  }

  /**
   * Applies a list of events to an entity's state.
   * @returns The new state and the new version of the entity.
   */
  apply(params: {
    /**
     * The starting point to apply events on top of. If not provided, the initial
     * state will be created using the creation event applier on the first event
     * of the array.
     *
     * Throws if it is omitted and the first event is not the creation event, or
     * if it is omitted and no creation event applier has been mounted.
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

    let initialState: State;
    let newVersion: number;
    let initialEventApplied = false;

    // Presence, not truthiness. A snapshot whose state is `0`, `""`, `false`
    // or `null` is a legitimate snapshot — `State` is unconstrained and all of
    // those are JSON values — and testing it for falsiness silently discarded
    // it, sending a counter at zero down the creation path to either throw
    // "Initial event not found" or re-initialise and return a fabricated
    // state and version.
    if (snapshot === undefined) {
      if (!this.#creationEventApplier) {
        throw new NoCreationEventApplierError(this.#projectionName);
      }

      const first = events[0];

      if (first === undefined || first.name !== this.#creationEventName) {
        throw new CreationEventNotFoundError({
          projectionName: this.#projectionName,
          expected: String(this.#creationEventName),
          received: first?.name,
        });
      }

      initialState = this.#creationEventApplier({ event: first });

      newVersion = 1;
      initialEventApplied = true;
    } else {
      initialState = snapshot.state;
      newVersion = snapshot.version;
    }

    const incoming = validateJsonValue(initialState);

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
    // `structuredClone` would refuse.
    let newState = structuredClone(initialState);

    for (const [index, event] of events.entries()) {
      const applier = this.#appliers.get(event.name);

      if (!applier) {
        if (index === 0 && initialEventApplied) {
          // Skip the creation event, as it has already been applied
          continue;
        }

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
