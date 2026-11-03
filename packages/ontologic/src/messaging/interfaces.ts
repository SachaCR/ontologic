/**
 * Types shared by everything that moves messages: the event bus, the command
 * bus, and the connectors underneath them.
 */

/** Receives every failure a bus component or connector reports. */
export type ErrorHandler = (error: Error) => void;

/**
 * The lifecycle of a bus component.
 *
 * `STOPPING` is the graceful drain: new work is refused while in-flight work
 * finishes. Components that stop instantly never report it.
 */
export type BusStatus = "STARTED" | "STOPPED" | "STOPPING";

/**
 * What every bus component exposes, whichever bus it belongs to: the event bus
 * publisher and listener, and the command bus emitter and receiver.
 */
export interface BusComponent {
  start(): Promise<void>;
  stop(): Promise<void>;
  onError(handler: ErrorHandler): void;
  status(): BusStatus;
  /** @throws when one of the underlying connections fails its check. */
  checkConnection(): Promise<boolean>;
}

export interface StopOptions {
  /**
   * Hard limit, in ms, on the graceful drain. Once it elapses, `stop()` stops
   * the connectors anyway and reports the work it abandoned through
   * `onError`. Defaults to 2 minutes.
   */
  timeout?: number;
}

/**
 * What travels next to every message, event or command: which occurrence it is,
 * and when it was created.
 */
export interface MessageMetadata {
  /** Unique per occurrence. The command bus matches responses on it. */
  id: string;
  /** ISO 8601 date time with a timezone, e.g. `2026-01-15T10:30:00.000Z`. */
  createdAt: string;
}
