import { describe, it, expect, beforeEach, vi } from "vitest";

import type { EventMetadata } from "../../repository";
import { InMemoryConnectors } from "../connectors/in-memory";
import { DomainEventBusListener } from "../listener";
import { DomainEventBusPublisher } from "../publisher";
import { DomainEvent } from "../../domainEvent";
import {
  makeEvent,
  parseTestEvent,
  type TestEvent,
} from "./helpers/testEventValidator";
import { RecordingListenerConnector } from "./helpers/recordingConnector";

function makeMetadata(overrides?: Partial<EventMetadata>): EventMetadata {
  return {
    id: overrides?.id ?? "evt-meta-1",
    createdAt: overrides?.createdAt ?? "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("DomainEventBusPublisher", () => {
  let connectors: InMemoryConnectors;

  beforeEach(() => {
    connectors = new InMemoryConnectors();
  });

  it("throws when publisherConnector is missing", () => {
    expect(
      () =>
        new DomainEventBusPublisher<TestEvent>({
          publisherConnector: undefined as never,
        }),
    ).toThrow("[DomainEventBusPublisher] Must have a publisher connector");
  });

  it("start and stop update connector status", async () => {
    const publisher = new DomainEventBusPublisher<TestEvent>({
      publisherConnector: connectors.publisher,
    });

    expect(publisher.status()).toBe("STOPPED");

    await publisher.start();
    expect(publisher.status()).toBe("STARTED");

    await publisher.stop();
    expect(publisher.status()).toBe("STOPPED");
  });

  it("publish sends JSON envelope with event name as routing key", async () => {
    const received: { event: TestEvent; metadata: EventMetadata }[] = [];

    const listener = new DomainEventBusListener<TestEvent>({
      listenerConnector: connectors.listener,
      options: { validator: parseTestEvent },
    });

    listener.listenTo(
      "TestEvent",
      async (event: TestEvent, metadata: EventMetadata) => {
        received.push({ event, metadata });
      },
    );

    const publisher = new DomainEventBusPublisher<TestEvent>({
      publisherConnector: connectors.publisher,
    });

    await listener.start();
    await publisher.start();

    const event = makeEvent();
    const metadata = makeMetadata();

    await publisher.publish(event, metadata);

    expect(received).toHaveLength(1);

    const receivedEvent = received[0]?.event;
    expect(receivedEvent).toBeInstanceOf(DomainEvent);
    expect(receivedEvent?.entityId).toBe(event.entityId);
    expect(receivedEvent?.name).toBe("TestEvent");
    expect(receivedEvent?.version).toBe(1);
    expect(receivedEvent?.payload).toEqual({ foo: "bar" });

    expect(received[0]?.metadata).toEqual(metadata);
  });
});

describe("DomainEventBusListener", () => {
  let connectors: InMemoryConnectors;

  beforeEach(() => {
    connectors = new InMemoryConnectors();
  });

  it("throws when listenerConnector is missing", () => {
    expect(
      () =>
        new DomainEventBusListener<TestEvent>({
          listenerConnector: undefined as never,
          options: {
            validator: parseTestEvent,
          },
        }),
    ).toThrow("[DomainEventBusListener] Must have a listener connector");
  });

  it("throws when start() is called with no handlers registered", async () => {
    const listener = new DomainEventBusListener<TestEvent>({
      listenerConnector: connectors.listener,
      options: { validator: parseTestEvent },
    });

    await expect(listener.start()).rejects.toThrow(
      "Cannot start the listener if you have no listener registered",
    );
  });

  it("invokes the handler for the matching event name", async () => {
    const handler =
      vi.fn<(event: TestEvent, metadata: EventMetadata) => Promise<void>>();
    const listener = new DomainEventBusListener<TestEvent>({
      listenerConnector: connectors.listener,
      options: { validator: parseTestEvent },
    });

    listener.listenTo("TestEvent", handler);

    await listener.start();

    const publisher = new DomainEventBusPublisher<TestEvent>({
      publisherConnector: connectors.publisher,
    });

    const event = makeEvent({ payload: { foo: "baz" } });
    const metadata = makeMetadata({ id: "m-2" });

    await publisher.publish(event, metadata);

    expect(handler).toHaveBeenCalledTimes(1);

    const receivedEvent = handler.mock.calls[0]?.[0];
    expect(receivedEvent).toBeInstanceOf(DomainEvent);
    expect(receivedEvent?.entityId).toBe(event.entityId);
    expect(receivedEvent?.name).toBe("TestEvent");
    expect(receivedEvent?.version).toBe(1);
    expect(receivedEvent?.payload).toEqual({ foo: "baz" });

    expect(handler.mock.calls[0]?.[1]).toEqual(metadata);
  });

  it("falls back to the wildcard handler when no specific handler exists", async () => {
    const handler =
      vi.fn<(event: TestEvent, metadata: EventMetadata) => Promise<void>>();
    const listener = new DomainEventBusListener<TestEvent>({
      listenerConnector: connectors.listener,
      options: { validator: parseTestEvent },
    });

    listener.listenTo("*", handler);

    await listener.start();

    const publisher = new DomainEventBusPublisher<TestEvent>({
      publisherConnector: connectors.publisher,
    });

    const event = makeEvent();
    const metadata = makeMetadata();

    await publisher.publish(event, metadata);

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("acks an event it has no handler for, rather than nacking it", async () => {
    // A consumer subscribes to what it needs. An event it did not ask for is
    // not a failure, and nacking would ask the broker to redeliver something
    // that can never be handled — a loop, or a dead-letter queue full of other
    // people's events.
    const recording = new RecordingListenerConnector();
    const listener = new DomainEventBusListener<TestEvent>({
      listenerConnector: recording,
      options: { validator: parseTestEvent },
    });

    listener.listenTo("TestEvent", async () => {});
    await listener.start();

    await recording.deliver("OtherEvent", "{}");

    expect(recording.acked).toEqual(["OtherEvent"]);
    expect(recording.nacked).toEqual([]);
  });

  it("does not report an unhandled event as an error", async () => {
    const onError = vi.fn<(error: unknown) => void>();
    const recording = new RecordingListenerConnector();
    const listener = new DomainEventBusListener<TestEvent>({
      listenerConnector: recording,
      options: { validator: parseTestEvent },
    });

    listener.listenTo("TestEvent", async () => {});
    listener.onError(onError);
    await listener.start();

    await recording.deliver("OtherEvent", "{}");

    expect(onError).not.toHaveBeenCalled();
  });

  it("reports an unhandled event through onUnhandled", async () => {
    const onUnhandled = vi.fn<(eventName: string) => void>();
    const recording = new RecordingListenerConnector();
    const listener = new DomainEventBusListener<TestEvent>({
      listenerConnector: recording,
      options: { validator: parseTestEvent },
    });

    listener.listenTo("TestEvent", async () => {});
    listener.onUnhandled(onUnhandled);
    await listener.start();

    await recording.deliver("OtherEvent", "{}");

    expect(onUnhandled).toHaveBeenCalledWith("OtherEvent");
  });

  it("survives an unhandled event with nothing observing it", async () => {
    // The regression this replaces: the old code emitted "error" on a bare
    // EventEmitter, and Node throws an "error" event that has no listener. A
    // consumer that never registered onError therefore threw on every event it
    // did not subscribe to — which is the shipped example's exact shape.
    const recording = new RecordingListenerConnector();
    const listener = new DomainEventBusListener<TestEvent>({
      listenerConnector: recording,
      options: { validator: parseTestEvent },
    });

    listener.listenTo("TestEvent", async () => {});
    await listener.start();

    await expect(recording.deliver("OtherEvent", "{}")).resolves.toBeUndefined();
    expect(recording.acked).toEqual(["OtherEvent"]);
  });

  it("still nacks when a handler throws", async () => {
    const recording = new RecordingListenerConnector();
    const listener = new DomainEventBusListener<TestEvent>({
      listenerConnector: recording,
      options: { validator: parseTestEvent },
    });

    listener.listenTo("TestEvent", async () => {
      throw new Error("handler blew up");
    });
    await listener.start();

    await recording.deliver(
      "TestEvent",
      JSON.stringify({ event: makeEvent(), metadata: makeMetadata() }),
    );

    expect(recording.nacked).toEqual(["TestEvent"]);
    expect(recording.acked).toEqual([]);
  });

  it("reports the reason it nacked a handler failure", async () => {
    const onError = vi.fn<(error: unknown) => void>();
    const recording = new RecordingListenerConnector();
    const listener = new DomainEventBusListener<TestEvent>({
      listenerConnector: recording,
      options: { validator: parseTestEvent },
    });

    listener.listenTo("TestEvent", async () => {
      throw new Error("handler blew up");
    });
    listener.onError(onError);
    await listener.start();

    await recording.deliver(
      "TestEvent",
      JSON.stringify({ event: makeEvent(), metadata: makeMetadata() }),
    );

    expect(onError).toHaveBeenCalledTimes(1);
    expect((onError.mock.calls[0]?.[0] as Error).message).toBe(
      "handler blew up",
    );
  });

  it("nacks a message whose content is not JSON", async () => {
    const onError = vi.fn<(error: unknown) => void>();
    const handler =
      vi.fn<(event: TestEvent, metadata: EventMetadata) => Promise<void>>();
    const recording = new RecordingListenerConnector();
    const listener = new DomainEventBusListener<TestEvent>({
      listenerConnector: recording,
      options: { validator: parseTestEvent },
    });

    listener.listenTo("TestEvent", handler);
    listener.onError(onError);
    await listener.start();

    await recording.deliver("TestEvent", "not json at all");

    expect(recording.nacked).toEqual(["TestEvent"]);
    expect(recording.acked).toEqual([]);
    expect(handler).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("nacks a message whose metadata is invalid", async () => {
    const onError = vi.fn<(error: unknown) => void>();
    const handler =
      vi.fn<(event: TestEvent, metadata: EventMetadata) => Promise<void>>();
    const recording = new RecordingListenerConnector();
    const listener = new DomainEventBusListener<TestEvent>({
      listenerConnector: recording,
      options: { validator: parseTestEvent },
    });

    listener.listenTo("TestEvent", handler);
    listener.onError(onError);
    await listener.start();

    await recording.deliver(
      "TestEvent",
      JSON.stringify({ event: makeEvent(), metadata: { id: "" } }),
    );

    expect(recording.nacked).toEqual(["TestEvent"]);
    expect(handler).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("nacks an invalid message without throwing when nothing observes errors", async () => {
    // The trap this fix has to avoid: `emit("error")` on a bare EventEmitter
    // throws when no listener is registered, which is what made the old
    // no-handler branch skip its own nack. The internal channel must not be the
    // reserved one.
    const recording = new RecordingListenerConnector();
    const listener = new DomainEventBusListener<TestEvent>({
      listenerConnector: recording,
      options: { validator: parseTestEvent },
    });

    listener.listenTo("TestEvent", handlerThatNeverRuns);
    await listener.start();

    await expect(
      recording.deliver("TestEvent", "not json at all"),
    ).resolves.toBeUndefined();

    expect(recording.nacked).toEqual(["TestEvent"]);
  });
});

async function handlerThatNeverRuns() {
  throw new Error("the message never gets this far");
}

describe("event validator option", () => {
  let connectors: InMemoryConnectors;

  beforeEach(() => {
    connectors = new InMemoryConnectors();
  });

  it("DomainEventBusPublisher calls parseTestEvent and rejects publish when the event is invalid", async () => {
    const validator = vi.fn(parseTestEvent);

    const publisher = new DomainEventBusPublisher<TestEvent>({
      publisherConnector: connectors.publisher,
      options: { validator },
    });

    const invalid = {
      entityId: "e1",
      name: "WrongEvent",
      version: 1,
      payload: { foo: "x" },
    } as unknown as TestEvent;

    await expect(publisher.publish(invalid, makeMetadata())).rejects.toThrow(
      'TestEvent: expected name "TestEvent"',
    );

    expect(validator).toHaveBeenCalledTimes(1);
    expect(validator).toHaveBeenCalledWith(invalid);
  });

  it("DomainEventBusPublisher does not run the event validator when metadata validation fails first", async () => {
    const validator = vi.fn(parseTestEvent);

    const publisher = new DomainEventBusPublisher<TestEvent>({
      publisherConnector: connectors.publisher,
      options: { validator },
    });

    await expect(
      publisher.publish(makeEvent(), {
        id: "",
        createdAt: "2026-01-01T00:00:00.000Z",
      }),
    ).rejects.toThrow("Invalid Metadata: id is an empty string");

    expect(validator).not.toHaveBeenCalled();
  });

  it("DomainEventBusListener calls parseTestEvent and does not run the handler when the event is invalid", async () => {
    const validator = vi.fn(parseTestEvent);

    const handler =
      vi.fn<(event: TestEvent, metadata: EventMetadata) => Promise<void>>();
    const onError = vi.fn<(error: unknown) => void>();

    // Delivered through the recording connector rather than the in-memory one:
    // this used to pass only because a rejected callback happened to resurface
    // as an "error" on that connector's shared emitter, which also meant the
    // message was neither acked nor nacked.
    const recording = new RecordingListenerConnector();
    const listener = new DomainEventBusListener<TestEvent>({
      listenerConnector: recording,
      options: { validator },
    });

    listener.listenTo("TestEvent", handler);
    listener.onError(onError);

    await listener.start();

    await recording.deliver(
      "TestEvent",
      JSON.stringify({ event: null, metadata: makeMetadata() }),
    );

    expect(validator).toHaveBeenCalledTimes(1);
    expect(validator).toHaveBeenCalledWith(null);
    expect(handler).not.toHaveBeenCalled();
    expect(recording.nacked).toEqual(["TestEvent"]);
    expect(recording.acked).toEqual([]);
    expect(onError.mock.calls[0]?.[0]).toBeInstanceOf(Error);
    expect((onError.mock.calls[0]?.[0] as Error).message).toBe(
      "TestEvent: expected an object",
    );
  });

  it("publishes and delivers the event when parseTestEvent accepts the wire payload", async () => {
    const publisherValidator = vi.fn(parseTestEvent);
    const listenerValidator = vi.fn(parseTestEvent);

    const received: Array<{ event: TestEvent; metadata: EventMetadata }> = [];

    const listener = new DomainEventBusListener<TestEvent>({
      listenerConnector: connectors.listener,
      options: { validator: listenerValidator },
    });

    listener.listenTo("TestEvent", async (event, metadata) => {
      received.push({ event, metadata });
    });

    await listener.start();

    const publisher = new DomainEventBusPublisher<TestEvent>({
      publisherConnector: connectors.publisher,
      options: { validator: publisherValidator },
    });

    const event = makeEvent({ payload: { foo: "accepted" } });

    const metadata = makeMetadata({ id: "m-ok" });

    await publisher.publish(event, metadata);

    expect(received).toHaveLength(1);

    expect(publisherValidator).toHaveBeenCalledTimes(1);
    expect(publisherValidator).toHaveBeenCalledWith(event);

    expect(listenerValidator).toHaveBeenCalledTimes(1);

    const wirePayload = listenerValidator.mock.calls[0]?.[0];

    expect(wirePayload).toEqual({
      entityId: event.entityId,
      name: "TestEvent",
      version: 1,
      payload: { foo: "accepted" },
    });

    const receivedEvent = received[0]?.event;
    expect(receivedEvent).toBeInstanceOf(DomainEvent);
    expect(receivedEvent?.entityId).toBe(event.entityId);
    expect(receivedEvent?.name).toBe("TestEvent");
    expect(receivedEvent?.version).toBe(1);
    expect(receivedEvent?.payload).toEqual({ foo: "accepted" });

    expect(received[0]?.metadata).toEqual(metadata);

    const parsedEvent = listenerValidator.mock.results[0]?.value;

    expect(parsedEvent).toBeInstanceOf(DomainEvent);
  });
});

describe("DomainEventBusListener + DomainEventBusPublisher (in-memory)", () => {
  let connectors: InMemoryConnectors;

  beforeEach(() => {
    connectors = new InMemoryConnectors();
  });

  it("delivers published events to the listener handler end-to-end", async () => {
    const received: Array<{ event: TestEvent; metadata: EventMetadata }> = [];

    const listener = new DomainEventBusListener<TestEvent>({
      listenerConnector: connectors.listener,
      options: { validator: parseTestEvent },
    });

    listener.listenTo("TestEvent", async (event, metadata) => {
      received.push({ event, metadata });
    });

    await listener.start();

    const publisher = new DomainEventBusPublisher<TestEvent>({
      publisherConnector: connectors.publisher,
    });

    await publisher.start();

    const event = makeEvent();
    const metadata = makeMetadata();

    await publisher.publish(event, metadata);

    expect(received).toHaveLength(1);

    const receivedEvent = received[0]?.event;
    expect(receivedEvent).toBeInstanceOf(DomainEvent);
    expect(receivedEvent?.entityId).toBe(event.entityId);
    expect(receivedEvent?.name).toBe("TestEvent");
    expect(receivedEvent?.version).toBe(1);
    expect(receivedEvent?.payload).toEqual({ foo: "bar" });

    expect(received[0]?.metadata).toEqual(metadata);
  });
});
