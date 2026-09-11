/**
 * Everything `EventProjection.apply` throws.
 *
 * All five signal a programmer error — an applier that was never declared, a
 * stream that does not begin where it claims to, one that replays a creation
 * event onto state that already exists, a state that cannot survive being
 * persisted. None of them is a domain failure, so none is returned in a result
 * type: there is no business decision to make about them, only a bug to fix.
 *
 * They are classes rather than bare `Error`s so that a caller can branch on
 * `name` without parsing a message, and so that the context needed to fix the
 * bug — which projection, which event, where in the state — travels with the
 * error instead of being flattened into prose.
 */

import type { JsonInvalidCode } from "./json";

export type EventSourcingErrorName =
  | "NO_CREATION_EVENT"
  | "CREATION_EVENT_NOT_FOUND"
  | "CREATION_EVENT_REPLAYED"
  | "UNKNOWN_EVENT_APPLIER"
  | "INVALID_PROJECTED_STATE";

/**
 * Base for all of them. Prefixes every message with the projection's name,
 * because a service folding a dozen projections needs to know which one
 * complained before it needs anything else.
 */
export abstract class EventSourcingError extends Error {
  abstract override readonly name: EventSourcingErrorName;

  /** The name the projection was constructed with. */
  readonly projectionName: string;

  constructor(projectionName: string, message: string) {
    super(`[${projectionName}] ${message}`);
    this.projectionName = projectionName;
  }
}

/**
 * `apply` was called without a snapshot, so the state had to be built from a
 * creation event — and the config never named one.
 *
 * A projection with no `creationEvent` can only ever be folded onto a snapshot,
 * which is the normal shape for a read model: nothing creates a view, so you
 * start it from its empty shape.
 */
export class NoCreationEventError extends EventSourcingError {
  override readonly name = "NO_CREATION_EVENT" as const;

  constructor(projectionName: string) {
    super(
      projectionName,
      "No creation event declared. Name one with `creationEvent` in the " +
        "config, or pass a snapshot to fold onto.",
    );
  }
}

/**
 * `apply` was called without a snapshot, and the stream does not begin with
 * the creation event — so there is no state to start from.
 */
export class CreationEventNotFoundError extends EventSourcingError {
  override readonly name = "CREATION_EVENT_NOT_FOUND" as const;

  /** The event name the creation applier was mounted for. */
  readonly expected: string;

  /** The first event in the stream, or `undefined` if it was empty. */
  readonly received: string | undefined;

  constructor(params: {
    projectionName: string;
    expected: string;
    received: string | undefined;
  }) {
    const { projectionName, expected, received } = params;

    super(
      projectionName,
      `Initial event not found: expected the stream to start with ${expected}, ` +
        (received === undefined
          ? "but it is empty."
          : `but it starts with ${received}.`),
    );

    this.expected = expected;
    this.received = received;
  }
}

/**
 * The creation event turned up where a state already exists: on top of a
 * snapshot, or partway through a stream.
 *
 * Almost always a caller folding a whole stream onto a snapshot it had already
 * folded. Left unchecked that re-runs the creation applier and hands back a
 * freshly created state carrying a plausible version, which is far worse than
 * an error — it is a wrong answer that looks right.
 */
export class CreationEventReplayedError extends EventSourcingError {
  override readonly name = "CREATION_EVENT_REPLAYED" as const;

  /** The creation event's name. */
  readonly eventName: string;

  /** Its zero-based position in the `events` array that was passed in. */
  readonly eventIndex: number;

  constructor(params: {
    projectionName: string;
    eventName: string;
    eventIndex: number;
  }) {
    const { projectionName, eventName, eventIndex } = params;

    super(
      projectionName,
      `Creation event ${eventName} replayed at position ${eventIndex + 1} of ` +
        "a stream folded onto an existing state. A creation event can only be " +
        "the first event of a fold that starts from nothing.",
    );

    this.eventName = eventName;
    this.eventIndex = eventIndex;
  }
}

/**
 * An event in the stream has no applier declared for its name.
 *
 * The applier map is exhaustive over the event union, so this is unreachable
 * for well-typed code. It still fires for the case that matters in production:
 * a stream written before a new event type existed, replayed through a
 * projection that predates it.
 */
export class UnknownEventApplierError extends EventSourcingError {
  override readonly name = "UNKNOWN_EVENT_APPLIER" as const;

  /** The event name with no applier. */
  readonly eventName: string;

  /** Its zero-based position in the `events` array that was passed in. */
  readonly eventIndex: number;

  /** How many events were passed in. */
  readonly streamLength: number;

  constructor(params: {
    projectionName: string;
    eventName: string;
    eventIndex: number;
    streamLength: number;
  }) {
    const { projectionName, eventName, eventIndex, streamLength } = params;

    super(
      projectionName,
      `Unknown event applier: ${eventName} (event ${eventIndex + 1} of ${streamLength}).`,
    );

    this.eventName = eventName;
    this.eventIndex = eventIndex;
    this.streamLength = streamLength;
  }
}

/**
 * A state is not JSON-compatible, so it could not survive being stored and
 * read back.
 *
 * Carries the validator's full diagnosis rather than the fact of failure: the
 * stable `code` to branch on, the `path` to the offending value, and the
 * `reason` to show a human.
 */
export class InvalidProjectedStateError extends EventSourcingError {
  override readonly name = "INVALID_PROJECTED_STATE" as const;

  /**
   * `"initial"` — the state `apply` started from, whether that came from the
   * snapshot or from the creation applier.
   * `"projected"` — the state an applier returned.
   */
  readonly stage: "initial" | "projected";

  /** Stable discriminant, so callers can branch without parsing `reason`. */
  readonly code: JsonInvalidCode;

  /** Location of the first problem found, e.g. `$.users[1].cb`. */
  readonly path: string;

  /** Human-readable message, meant for display. Its wording is not stable. */
  readonly reason: string;

  constructor(params: {
    projectionName: string;
    stage: "initial" | "projected";
    code: JsonInvalidCode;
    path: string;
    reason: string;
  }) {
    const { projectionName, stage, code, path, reason } = params;

    const which =
      stage === "initial" ? "The initial state" : "The projected state";

    super(
      projectionName,
      `${which} is not JSON compatible: ${reason} at ${path}.`,
    );

    this.stage = stage;
    this.code = code;
    this.path = path;
    this.reason = reason;
  }
}
