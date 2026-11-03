import { describe, it, expect, vi } from "vitest";

import { MessageRelay } from "..";
import { InMemoryMessageRelayStateRepository } from "../repository/inMemory";
import { DomainEventBusPublisher } from "../../event-bus";
import { ok, err } from "../../result";
import type { DomainEventInterface } from "../../domainEvent";
import type { EventWithMetadata } from "../../repository";

type RelayParams = ConstructorParameters<typeof MessageRelay>;

function event(id: string): EventWithMetadata<DomainEventInterface> {
  return {
    event: {
      name: "ORDER_PLACED",
      version: 1,
      entityId: "order-1",
      payload: {},
    },
    metadata: { id, createdAt: "2026-01-01T00:00:00.000Z" },
  };
}

/** An outbox holding `events` for every entity, read after a checkpoint. */
function outbox(
  events: EventWithMetadata<DomainEventInterface>[],
  options?: { fails?: Error },
) {
  return {
    getEventsAfter: vi.fn(async (_entityId: string, lastId?: string) => {
      if (options?.fails) {
        return err(options.fails);
      }

      const from = lastId
        ? events.findIndex((e) => e.metadata.id === lastId) + 1
        : 0;

      return ok(events.slice(from));
    }),
  } as unknown as RelayParams[0];
}

/** A publisher that records what it was asked to publish, failing on `failOn`. */
function publisher(options?: { failOn?: string; throwing?: unknown }) {
  const published: { id: string; orderingKey: string | undefined }[] = [];

  const publish = vi.fn(
    async (
      _event: DomainEventInterface,
      metadata: { id: string },
      publishOptions?: { orderingKey?: string },
    ) => {
      if (metadata.id === options?.failOn) {
        throw options.throwing ?? new Error("broker down");
      }

      published.push({
        id: metadata.id,
        orderingKey: publishOptions?.orderingKey,
      });
    },
  );

  return {
    publisher: {
      publish,
    } as unknown as DomainEventBusPublisher<DomainEventInterface>,
    published,
  };
}

function relay(
  events: EventWithMetadata<DomainEventInterface>[],
  options?: {
    failOn?: string;
    throwing?: unknown;
    readFails?: Error;
    state?: InMemoryMessageRelayStateRepository;
  },
) {
  const state = options?.state ?? new InMemoryMessageRelayStateRepository();
  const { publisher: bus, published } = publisher(options);
  const created = new MessageRelay(
    outbox(
      events,
      options?.readFails ? { fails: options.readFails } : undefined,
    ),
    state,
    "Order",
    bus,
  );

  return { relay: created, published, state };
}

describe("MessageRelay", () => {
  it("publishes every event after the checkpoint", async () => {
    const { relay: subject, published } = relay([event("e1"), event("e2")]);

    await subject.handler("order-1");

    expect(published.map((p) => p.id)).toEqual(["e1", "e2"]);
  });

  it("orders delivery by the aggregate id", async () => {
    const { relay: subject, published } = relay([event("e1")]);

    await subject.handler("order-1");

    expect(published[0]?.orderingKey).toBe("order-1");
  });

  it("moves the checkpoint to the last event published", async () => {
    const { relay: subject, state } = relay([event("e1"), event("e2")]);

    await subject.handler("order-1");

    expect(
      await state.getLastEventIdPublished({
        entityId: "order-1",
        entityName: "Order",
      }),
    ).toBe("e2");
  });

  it("reports a failed publish through onError", async () => {
    const { relay: subject } = relay([event("e1")], { failOn: "e1" });
    const onError = vi.fn();
    subject.onError(onError);

    await subject.handler("order-1");

    expect(onError).toHaveBeenCalledWith(new Error("broker down"));
  });

  it("does not reject when a publish fails and nobody registered onError", async () => {
    // It used to: the failure went out on the EventEmitter "error" channel,
    // which throws when no listener is registered.
    const { relay: subject } = relay([event("e1")], { failOn: "e1" });

    await expect(subject.handler("order-1")).resolves.toBeUndefined();
  });

  it("reports something thrown that is not an Error as an Error", async () => {
    const { relay: subject } = relay([event("e1")], {
      failOn: "e1",
      throwing: "a string",
    });
    const onError = vi.fn();
    subject.onError(onError);

    await subject.handler("order-1");

    expect(onError).toHaveBeenCalledWith(new Error("a string"));
  });

  it("reports a failure to read the outbox", async () => {
    const { relay: subject } = relay([], { readFails: new Error("db down") });
    const onError = vi.fn();
    subject.onError(onError);

    await subject.handler("order-1");

    expect(onError).toHaveBeenCalledWith(new Error("db down"));
  });

  it("stops at the failed event, leaving the checkpoint on the last success", async () => {
    const { relay: subject, state } = relay(
      [event("e1"), event("e2"), event("e3")],
      { failOn: "e2" },
    );

    await subject.handler("order-1");

    expect(
      await state.getLastEventIdPublished({
        entityId: "order-1",
        entityName: "Order",
      }),
    ).toBe("e1");
  });

  it("does not publish past the failed event", async () => {
    const { relay: subject, published } = relay(
      [event("e1"), event("e2"), event("e3")],
      { failOn: "e2" },
    );

    await subject.handler("order-1");

    expect(published.map((p) => p.id)).toEqual(["e1"]);
  });

  it("releases its lock after a failure, so the next run can take it", async () => {
    const { relay: subject, state } = relay([event("e1")], { failOn: "e1" });

    await subject.handler("order-1");

    await expect(
      state.lock({ entityId: "order-1", entityName: "Order" }),
    ).resolves.toBeUndefined();
  });

  it("reports a lock held by another run", async () => {
    const state = new InMemoryMessageRelayStateRepository();
    await state.lock({ entityId: "order-1", entityName: "Order" });
    const { relay: subject } = relay([event("e1")], { state });
    const onError = vi.fn();
    subject.onError(onError);

    await subject.handler("order-1");

    expect(onError).toHaveBeenCalledWith(
      new Error(
        "[MESSAGE RELAY REPOSITORY]: Lock already held for Order:order-1",
      ),
    );
  });

  it("leaves another run's lock alone when it could not take it", async () => {
    const state = new InMemoryMessageRelayStateRepository();
    await state.lock({ entityId: "order-1", entityName: "Order" });
    const { relay: subject } = relay([event("e1")], { state });

    await subject.handler("order-1");

    await expect(
      state.lock({ entityId: "order-1", entityName: "Order" }),
    ).rejects.toThrow("Lock already held for Order:order-1");
  });

  it("does not publish when another run holds the lock", async () => {
    const state = new InMemoryMessageRelayStateRepository();
    await state.lock({ entityId: "order-1", entityName: "Order" });
    const { relay: subject, published } = relay([event("e1")], { state });

    await subject.handler("order-1");

    expect(published).toEqual([]);
  });
});
