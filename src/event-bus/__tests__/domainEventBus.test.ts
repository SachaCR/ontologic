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
    const received: { name: string; content: string }[] = [];
    connectors.listener.onMessage(async (message) => {
      received.push({ name: message.name, content: message.content });
    });
    await connectors.listener.start();

    const publisher = new DomainEventBusPublisher<TestEvent>({
      publisherConnector: connectors.publisher,
    });

    const event = makeEvent();
    const metadata = makeMetadata();

    await publisher.publish(event, metadata);

    expect(received).toHaveLength(1);
    expect(received[0]?.name).toBe("TestEvent");
    const parsed = JSON.parse(received[0]?.content ?? "{}") as {
      event: unknown;
      metadata: unknown;
    };
    expect(parsed.event).toEqual({
      entityId: event.entityId,
      name: "TestEvent",
      version: 1,
      payload: { foo: "bar" },
    });
    expect(parsed.metadata).toEqual(metadata);
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
        }),
    ).toThrow("[DomainEventBusListener] Must have a listener connector");
  });

  it("throws when start() is called with no handlers registered", async () => {
    const listener = new DomainEventBusListener<TestEvent>({
      listenerConnector: connectors.listener,
    });

    await expect(listener.start()).rejects.toThrow(
      "Cannot start the listener if you have no listener registered",
    );
  });

  it("invokes the handler for the matching event name", async () => {
    const handler = vi.fn<(event: TestEvent, metadata: EventMetadata) => Promise<void>>();
    const listener = new DomainEventBusListener<TestEvent>({
      listenerConnector: connectors.listener,
    });

    listener.listenTo("TestEvent", handler);

    await listener.start();

    const publisher = new DomainEventBusPublisher<TestEvent>({
      publisherConnector: connectors.publisher,
    });

    const event = makeEvent({ payload: { foo: "baz" } });
    const metadata = makeMetadata({ id: "m-2" });

    await publisher.publish(event, metadata);

    await vi.waitFor(() => expect(handler).toHaveBeenCalledTimes(1));

    expect(handler.mock.calls[0]?.[0]).toEqual({
      entityId: event.entityId,
      name: "TestEvent",
      version: 1,
      payload: { foo: "baz" },
    });
    expect(handler.mock.calls[0]?.[1]).toEqual(metadata);
  });

  it("falls back to the wildcard handler when no specific handler exists", async () => {
    const handler = vi.fn<(event: TestEvent, metadata: EventMetadata) => Promise<void>>();
    const listener = new DomainEventBusListener<TestEvent>({
      listenerConnector: connectors.listener,
    });

    listener.listenTo("*", handler);

    await listener.start();

    const publisher = new DomainEventBusPublisher<TestEvent>({
      publisherConnector: connectors.publisher,
    });

    const event = makeEvent();
    const metadata = makeMetadata();

    await publisher.publish(event, metadata);

    await vi.waitFor(() => expect(handler).toHaveBeenCalledTimes(1));
  });

  it("notifies onError when no handler matches the message name", async () => {
    const onError = vi.fn<(error: unknown) => void>();
    const listener = new DomainEventBusListener<TestEvent>({
      listenerConnector: connectors.listener,
    });

    listener.listenTo("TestEvent", async () => {});
    listener.onError(onError);

    await listener.start();

    await connectors.publisher.publish("OtherEvent", "{}");

    await vi.waitFor(() => expect(onError).toHaveBeenCalled());

    expect(onError.mock.calls[0]?.[0]).toBeInstanceOf(Error);
    expect(String((onError.mock.calls[0]?.[0] as Error).message)).toContain("No event handler found");
  });

  it("invokes the handler with a null event when the envelope has event: null (listener does not validate event shape)", async () => {
    const handler = vi.fn<(event: TestEvent | null, metadata: EventMetadata) => Promise<void>>();
    const listener = new DomainEventBusListener<TestEvent>({
      listenerConnector: connectors.listener,
    });

    listener.listenTo("TestEvent", handler);

    await listener.start();

    connectors.publisher.publish(
      "TestEvent",
      JSON.stringify({ event: null, metadata: makeMetadata() }),
    );

    await vi.waitFor(() => expect(handler).toHaveBeenCalledTimes(1));
    expect(handler.mock.calls[0]?.[0]).toBeNull();
    expect(handler.mock.calls[0]?.[1]).toEqual(makeMetadata());
  });
});

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

    const handler = vi.fn<(event: TestEvent, metadata: EventMetadata) => Promise<void>>();
    const onError = vi.fn<(error: unknown) => void>();

    const listener = new DomainEventBusListener<TestEvent>({
      listenerConnector: connectors.listener,
      options: { validator },
    });

    listener.listenTo("TestEvent", handler);
    listener.onError(onError);

    await listener.start();

    connectors.publisher.publish(
      "TestEvent",
      JSON.stringify({ event: null, metadata: makeMetadata() }),
    );

    await vi.waitFor(() => expect(onError).toHaveBeenCalled());

    expect(validator).toHaveBeenCalledTimes(1);
    expect(validator).toHaveBeenCalledWith(null);
    expect(handler).not.toHaveBeenCalled();
    expect(onError.mock.calls[0]?.[0]).toBeInstanceOf(Error);
    expect((onError.mock.calls[0]?.[0] as Error).message).toBe("TestEvent: expected an object");
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

    await vi.waitFor(() => expect(received).toHaveLength(1));

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

    expect(received[0]?.event).toEqual({
      entityId: event.entityId,
      name: "TestEvent",
      version: 1,
      payload: { foo: "accepted" },
    });
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

    await vi.waitFor(() => expect(received).toHaveLength(1));

    expect(received[0]?.event).toEqual({
      entityId: event.entityId,
      name: "TestEvent",
      version: 1,
      payload: { foo: "bar" },
    });
    expect(received[0]?.metadata).toEqual(metadata);
  });
});
