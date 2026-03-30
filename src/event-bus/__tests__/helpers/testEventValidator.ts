import { DomainEvent } from "../../../domainEvent";

export type TestEvent = DomainEvent<"TestEvent", 1, { foo: string }>;

export function makeEvent(overrides?: Partial<{ entityId: string; payload: { foo: string } }>): TestEvent {
  return new DomainEvent({
    entityId: overrides?.entityId ?? "entity-1",
    name: "TestEvent",
    version: 1,
    payload: overrides?.payload ?? { foo: "bar" },
  });
}

/**
 * Validates wire or in-memory event payloads and returns a {@link TestEvent} instance.
 * Throws with a stable message prefix when the shape does not match.
 */
export function parseTestEvent(raw: unknown): TestEvent {
  if (raw == null || typeof raw !== "object") {
    throw new Error("TestEvent: expected an object");
  }

  const o = raw as Record<string, unknown>;

  if (typeof o["entityId"] !== "string" || o["entityId"].length === 0) {
    throw new Error("TestEvent: expected non-empty string entityId");
  }

  if (o["name"] !== "TestEvent") {
    throw new Error('TestEvent: expected name "TestEvent"');
  }

  if (o["version"] !== 1) {
    throw new Error("TestEvent: expected version 1");
  }

  if (o["payload"] == null || typeof o["payload"] !== "object") {
    throw new Error("TestEvent: expected an object payload");
  }

  const payload = o["payload"] as Record<string, unknown>;
  if (typeof payload["foo"] !== "string") {
    throw new Error("TestEvent: expected payload.foo to be a string");
  }

  return new DomainEvent({
    entityId: o["entityId"],
    name: "TestEvent",
    version: 1,
    payload: { foo: payload["foo"] },
  });
}
