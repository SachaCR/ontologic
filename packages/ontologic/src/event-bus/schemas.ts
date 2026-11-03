import { err, ok, type Result } from "../result";

/**
 * The envelope `DomainEventBusPublisher` writes on the wire, as seen before any
 * validation of its parts.
 *
 * Only `event.name` is promised: routing needs it. The event itself is checked
 * by the caller's validator, and `metadata` by `validateMetadata`, once a
 * handler has been found.
 */
export interface EventBusMessage {
  event: { name: string } & Record<string, unknown>;
  metadata: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export const eventBusMessageSchema = {
  /**
   * Validates just enough of the envelope to route it: an `event` object with a
   * non-empty `name`.
   *
   * Like the command bus schemas, it takes an already decoded value and returns
   * an `Err` instead of throwing. A message that fails here is not going to
   * become routable on redelivery, so the caller acks it instead of nacking.
   */
  safeParse(input: unknown): Result<EventBusMessage, Error> {
    const shape = "EventBusMessage";

    if (!isRecord(input)) {
      return err(new Error(`Invalid ${shape}: not an object`));
    }

    const event = input["event"];

    if (!isRecord(event)) {
      return err(new Error(`Invalid ${shape}: event is not an object`));
    }

    if (typeof event["name"] !== "string" || event["name"].length === 0) {
      return err(new Error(`Invalid ${shape}: event received without a name`));
    }

    return ok(input as unknown as EventBusMessage);
  },
};
