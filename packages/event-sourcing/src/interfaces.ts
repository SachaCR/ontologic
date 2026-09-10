export interface EventProjectionInterface<State, Event extends SourceEvent> {
  name(): string;

  mountEventApplier<EventName extends Event["name"]>(
    eventName: EventName,
    eventApplier: EventApplier<Extract<Event, { name: EventName }>, State>,
  ): void;

  mountCreationEventApplier<EventName extends Event["name"]>(
    eventName: EventName,
    eventApplier: CreationEventApplier<
      Extract<Event, { name: EventName }>,
      State
    >,
  ): void;

  apply(params: { snapshot?: Snapshot<State>; events: Event[] }): {
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
