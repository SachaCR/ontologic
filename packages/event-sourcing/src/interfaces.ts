/**
 * Everything a projection needs to be built, given in one object.
 *
 * A config rather than a sequence of `mount` calls because the applier map can
 * then be *checked*: `appliers` is a mapped type over every event name in the
 * union, so forgetting one is a compile error rather than an
 * `UnknownEventApplierError` the first time that event turns up in a stream.
 * Registering the same event twice is impossible too, because object keys are
 * unique.
 *
 * The creation event sits in that same map, declared exactly like the others.
 * Only its *signature* differs — it receives `{ event }` and no `state`,
 * because at the first event there is none — and the conditional type below is
 * what arranges that. Asking for `state` in a creation applier does not
 * compile; nothing else about writing one is different.
 *
 * @typeParam CreationName - The name of the creation event, or `never` for a
 * projection that has none. TypeScript cannot infer some type arguments and
 * default the rest, so this is written out explicitly:
 * `new EventProjection<CartState, CartEvent, "CART_CREATED">({ … })`. Leave it
 * off entirely for a read model and every applier becomes an ordinary one.
 */
export type EventProjectionConfig<
  State,
  Event extends SourceEvent,
  CreationName extends Event["name"] = never,
> = {
  /** Named in the messages and on the `projectionName` field of its errors. */
  name: string;

  /**
   * The name of the event that brings the state into existence, for a
   * projection that can be folded from nothing. Omit it and `apply` requires a
   * snapshot.
   *
   * The name is needed at runtime as well as in the type argument, because
   * type parameters are erased: this is what lets `apply` insist a stream
   * starts with it, and refuse one that replays it onto existing state.
   */
  creationEvent?: CreationName;

  /**
   * One applier per event. Every member of the union must appear, including
   * the creation event: that is the point of the map.
   *
   * A projection that should ignore an event still has to say so, with
   * `({ state }) => state`. Better to narrow `Event` to the events you care
   * about and filter the stream, which the compiler then enforces.
   */
  appliers: {
    [Name in Event["name"]]: Name extends CreationName
      ? CreationEventApplier<Extract<Event, { name: Name }>, State>
      : EventApplier<Extract<Event, { name: Name }>, State>;
  };
};

/**
 * The contract a projection satisfies. Implement it to write your own;
 * {@link EventProjection} is simply the implementation this package ships.
 *
 * It is not something a *consumer* needs — folding events through
 * `EventProjection` requires none of this. Its whole audience is someone
 * writing an alternative: one that caches snapshots, records timings, or
 * decorates the shipped class.
 *
 * Deliberately says nothing about *how* a projection is configured, only what
 * it does once it is. Both members are declared as function-typed properties
 * rather than methods, and that is load-bearing: TypeScript compares *method*
 * parameters bivariantly, so an implementation demanding more than the contract
 * promises — an `apply` requiring the snapshot this declares optional, say —
 * would satisfy a method-declared interface while breaking every caller that
 * went through it. Properties fall under `strictFunctionTypes`, which is
 * contravariant, so that no longer type-checks.
 */
export interface EventProjectionInterface<State, Event extends SourceEvent> {
  name: () => string;

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
