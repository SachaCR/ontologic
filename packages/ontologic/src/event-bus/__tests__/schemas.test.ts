import { describe, it, expect } from "vitest";

import { eventBusMessageSchema } from "../schemas";

function envelope(eventOverrides?: Record<string, unknown>) {
  return {
    event: { entityId: "e1", name: "TestEvent", ...eventOverrides },
    metadata: { id: "evt-1", createdAt: "2026-01-01T00:00:00.000Z" },
  };
}

describe("eventBusMessageSchema.safeParse", () => {
  it("accepts an envelope whose event has a name", () => {
    const input = envelope();

    const result = eventBusMessageSchema.safeParse(input);

    expect(result.isOk() && result.value).toBe(input);
  });

  it("leaves metadata to validateMetadata", () => {
    const result = eventBusMessageSchema.safeParse({
      event: { name: "TestEvent" },
    });

    expect(result.isOk()).toBe(true);
  });

  it.each([
    ["null", null, "Invalid EventBusMessage: not an object"],
    ["an array", [], "Invalid EventBusMessage: not an object"],
    ["a string", "event", "Invalid EventBusMessage: not an object"],
    [
      "an envelope with no event",
      {},
      "Invalid EventBusMessage: event is not an object",
    ],
    [
      "an event that is not an object",
      { event: "TestEvent" },
      "Invalid EventBusMessage: event is not an object",
    ],
    [
      "an event with no name",
      { event: { entityId: "e1" } },
      "Invalid EventBusMessage: event received without a name",
    ],
    [
      "an event with an empty name",
      envelope({ name: "" }),
      "Invalid EventBusMessage: event received without a name",
    ],
    [
      "an event whose name is not a string",
      envelope({ name: 42 }),
      "Invalid EventBusMessage: event received without a name",
    ],
  ])("rejects %s", (_label, input, message) => {
    const result = eventBusMessageSchema.safeParse(input);

    expect(result.isErr() && result.error.message).toBe(message);
  });
});
