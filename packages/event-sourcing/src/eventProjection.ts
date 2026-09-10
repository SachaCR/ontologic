import {
  type CreationEventApplier,
  type EventApplier,
  type EventProjectionInterface,
  type Snapshot,
  type SourceEvent,
} from "./interfaces";
import { isJsonValue } from "./json";

/**
 * Rebuilds an entity's state by folding its own events onto a snapshot.
 *
 * Mount one applier per event name, then call {@link EventProjection.apply}.
 * The projection is pure and holds no state of its own: a snapshot and a list
 * of events go in, a new `{ state, version }` comes out. The same projection
 * can therefore rebuild the same stream from any starting point, which is what
 * makes it cheap to test.
 *
 * This is not `ontologic`'s `ReadModel`. A read model subscribes to the event
 * bus and folds events into whatever shape answers a query — the read side.
 * A projection here folds one entity's events back into the write-side state
 * its invariants are checked against.
 *
 * Extend this class to create projections for your entities.
 *
 * @typeParam State - The state of the entity.
 * @typeParam Event - The events that the entity can handle.
 */
export class EventProjection<
  State,
  Event extends SourceEvent,
> implements EventProjectionInterface<State, Event> {
  #appliers: Map<Event["name"], EventApplier<Event, State>>;
  #entityName: string;
  #creationEventApplier: CreationEventApplier<Event, State> | undefined;
  #creationEventName: Event["name"] | undefined;

  constructor(
    /**
     * The name of the entity.
     */
    entityName: string,
  ) {
    this.#entityName = entityName;
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

    let initialState = snapshot?.state;

    let newVersion = snapshot?.version ?? 0;

    let initialEventApplied = false;

    if (!initialState) {
      if (!this.#creationEventApplier) {
        throw new Error("No creation event applier configured");
      }

      if (
        events.length === 0 ||
        events[0] === undefined ||
        events[0]?.name !== this.#creationEventName
      ) {
        throw new Error("Initial event not found");
      }

      initialState = this.#creationEventApplier({
        event: events[0],
      });

      newVersion = newVersion + 1;
      initialEventApplied = true;
    }

    if (!isJsonValue(initialState)) {
      throw new Error("The initial state is not JSON compatible");
    }

    let newState = structuredClone(initialState);

    for (const [index, event] of events.entries()) {
      const applier = this.#appliers.get(event.name);

      if (!applier) {
        if (index === 0 && initialEventApplied) {
          // Skip the creation event, as it has already been applied
          continue;
        }

        throw new Error(`Unknown event applier: ${event.name}`);
      }

      newState = applier({
        event: event,
        state: newState,
      });

      newVersion = newVersion + 1;
    }

    if (!isJsonValue(newState)) {
      throw new Error("The new state is not JSON compatible");
    }

    return {
      state: newState,
      version: newVersion,
    };
  }

  /**
   * The name of the entity.
   */
  get entityName() {
    return this.#entityName;
  }
}
