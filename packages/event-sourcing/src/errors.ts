/**
 * Everything `EventProjection.apply` throws.
 *
 * All four signal a programmer error — an applier that was never mounted, a
 * stream that does not begin where it claims to, a state that cannot survive
 * being persisted. None of them is a domain failure, so none is returned in a
 * result type: there is no business decision to make about them, only a bug to
 * fix.
 *
 * They are classes rather than bare `Error`s so that a caller can branch on
 * `name` without parsing a message, and so that the context needed to fix the
 * bug — which projection, which event, where in the state — travels with the
 * error instead of being flattened into prose.
 */

import type { JsonInvalidCode } from "./json";

export type EventSourcingErrorName =
  | "NO_CREATION_EVENT_APPLIER"
  | "CREATION_EVENT_NOT_FOUND"
  | "UNKNOWN_EVENT_APPLIER"
  | "INVALID_PROJECTED_STATE";

/**
 * Base for the four. Prefixes every message with the projection's name,
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
 * creation event — and no creation event applier was ever mounted.
 */
export class NoCreationEventApplierError extends EventSourcingError {
  override readonly name = "NO_CREATION_EVENT_APPLIER" as const;

  constructor(projectionName: string) {
    super(
      projectionName,
      "No creation event applier configured. Give the config a " +
        "`creation` entry, or pass a snapshot to apply from.",
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
 * An event in the stream has no applier mounted for its name.
 *
 * Worth reading twice when it names your creation event: replaying a stream
 * that still contains the creation event on top of a snapshot lands here,
 * because a creation applier is mounted separately and is not in the ordinary
 * applier table.
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
