/**
 * The contract a projection satisfies. Implement it to write your own;
 * {@link EventProjection} is simply the implementation this package ships.
 *
 * It is not something a *consumer* needs — folding events through
 * `EventProjection` requires none of this. Its whole audience is someone
 * writing an alternative: one that reads its appliers from a config object,
 * caches snapshots, records timings, or decorates the shipped class.
 *
 * Every member is declared as a function-typed property rather than a method,
 * and that is load-bearing. TypeScript compares *method* parameters
 * bivariantly, so an implementation that demanded more than the contract
 * promises — an `apply` requiring the snapshot this declares optional, say —
 * would satisfy a method-declared interface while breaking every caller that
 * went through it. Properties fall under `strictFunctionTypes`, which is
 * contravariant, so that no longer type-checks.
 */
export interface EventProjectionInterface<State, Event extends SourceEvent> {
  name: () => string;

  mountEventApplier: <EventName extends Event["name"]>(
    eventName: EventName,
    eventApplier: EventApplier<Extract<Event, { name: EventName }>, State>,
  ) => void;

  mountCreationEventApplier: <EventName extends Event["name"]>(
    eventName: EventName,
    eventApplier: CreationEventApplier<
      Extract<Event, { name: EventName }>,
      State
    >,
  ) => void;

  apply: (params: { snapshot?: Snapshot<State>; events: Event[] }) => {
    state: State;
    version: number;
  };
}

/**
 * Applies one event to an entity's state and returns the next state.
 *
 * Must be pure: the same event and state always produce the same result, and
 * nothing outside is touched. A projection replays these on every rebuild, so
 * an applier that sends a mail or writes a row would do it again each time.
 */
export type EventApplier<Event extends SourceEvent, State> = (params: {
  event: Event;
  state: State;
}) => State;

/**
 * Builds an entity's first state from the event that created it.
 *
 * Takes no incoming state — there is none yet — which is why it is mounted
 * separately from the ordinary appliers.
 */
export type CreationEventApplier<Event extends SourceEvent, State> = (params: {
  event: Event;
}) => State;

export interface Snapshot<State> {
  /**
   * The state to apply events on top of.
   */
  state: State;

  /**
   * The version of that state: the number of events already folded into it.
   */
  version: number;
}

/**
 * SourceEvent is an interface allowing to create valid
 * events to be used in Event Sourcing.
 */
export interface SourceEvent {
  readonly name: string;
  readonly version: number;
  readonly payload: unknown;
}
