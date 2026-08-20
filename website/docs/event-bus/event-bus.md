---
sidebar_position: 1
---

# Event Bus

Once domain events are persisted via the [Outbox pattern](../domain-model/domain-events.md#publishing-with-the-outbox-pattern), a message relay needs to read them from the database and then use an event bus to deliver events to the rest of your system.

`ontologic` ships a typed event bus with a **publisher** and a **listener**, each backed by a pluggable **connector**. The connector is the only piece you swap out between environments: the publisher/listener logic stays the same whether you're running tests locally or processing millions of messages in production.

---

## Core concepts

### Publisher

The publisher publish events to a message broker. It accepts any event that matches your domain's event union type, validates the metadata, and hands off the serialized message to its connector.

### Listener

The listener subscribes to incoming messages from the broker and dispatches them to your handlers. You register a handler per event name — or a wildcard handler for everything — before starting the listener. Every delivery ends in exactly one of four ways, decided by the listener rather than by the connector:

| Outcome | Message | Reported through |
| --- | --- | --- |
| Your handler resolves | `ack()` | — |
| No handler registered for the event | `ack()` | `onUnhandled(name)` |
| Content is not JSON, or fails the validator | `nack()` | `onError(error)` |
| Your handler throws | `nack()` | `onError(error)` |

### Connector

The connector is the adapter between the event bus and the underlying broker. It is the only thing that knows about Kafka, SQS, RabbitMQ, or whatever you're running. The publisher and listener each depend on a connector interface — swap the connector, keep everything else.

---

## Defining your event union

Start by defining the union of all domain events your service produces or consumes. The event bus is generic over this union, which gives you type-safe handlers.

```typescript
import { DomainEvent } from "ontologic";

class OrderPlaced extends DomainEvent<
  "ORDER_PLACED",
  1,
  { orderId: string; total: number }
> {
  constructor(entityId: string, payload: { orderId: string; total: number }) {
    super({ name: "ORDER_PLACED", version: 1, entityId, payload });
  }
}

class PaymentReceived extends DomainEvent<
  "PAYMENT_RECEIVED",
  1,
  { amount: number; currency: string }
> {
  constructor(entityId: string, payload: { amount: number; currency: string }) {
    super({ name: "PAYMENT_RECEIVED", version: 1, entityId, payload });
  }
}

type OrderEvents = OrderPlaced | PaymentReceived;
```

---

## Publishing events

```typescript
import { DomainEventBusPublisher } from "ontologic";

const publisher = new DomainEventBusPublisher<OrderEvents>({
  publisherConnector: myConnector,
});

await publisher.start();

await publisher.publish(
  new OrderPlaced("order-123", { orderId: "order-123", total: 99 }),
  {
    id: "evt-abc",
    createdAt: new Date().toISOString(),
  },
);

await publisher.stop();
```

The `publish` method validates the metadata before forwarding. An invalid `id` or `createdAt` throws immediately — the event is never sent.

### Event metadata

Every published event carries metadata alongside the event payload:

| Field       | Type     | Required | Description                                                       |
| ----------- | -------- | -------- | ----------------------------------------------------------------- |
| `id`        | `string` | Yes      | Unique identifier for this event occurrence                       |
| `createdAt` | `string` | Yes      | ISO 8601 datetime with timezone (e.g. `2024-01-15T10:30:00.000Z`) |
| `offset`    | `number` | No       | Position in the event stream, if tracked                          |

---

## Listening to events

```typescript
import { DomainEventBusListener } from "ontologic";

const listener = new DomainEventBusListener<OrderEvents>({
  listenerConnector: myConnector,
});

listener.listenTo("ORDER_PLACED", async (event, metadata) => {
  // event is typed as OrderPlaced
  console.log(event.payload.orderId, metadata.id);
});

listener.listenTo("PAYMENT_RECEIVED", async (event, metadata) => {
  // event is typed as PaymentReceived
  console.log(event.payload.amount, event.payload.currency);
});

await listener.start();
```

You must register at least one handler before calling `start()` — starting without handlers throws an error.

### Wildcard handler

To handle all incoming events with a single callback, use `"*"` as the event name:

```typescript
listener.listenTo("*", async (event, metadata) => {
  console.log("received", event.name, metadata.id);
});
```

The wildcard handler is used as a fallback: if an incoming event has no specific handler registered, it falls through to `"*"`. If there is no specific handler and no wildcard, the message is **acknowledged** and the name is reported through `onUnhandled`.

Acknowledged, not nack'd: `listenTo` is per event name precisely so a consumer can take only what concerns it, and a nack asks the broker to deliver the message again. Nothing about the second attempt would differ — the handler is still not registered — so a nack here buys a redelivery loop, or a dead-letter queue filling with events that were never this consumer's business.

If you want to notice a handler you forgot to wire, register `onUnhandled`:

```ts
listener.onUnhandled((eventName) => {
  logger.debug(`no handler for ${eventName}`);
});
```

It is deliberately not `onError`. An unsubscribed event is a routine outcome, and a consumer with selective subscriptions would otherwise see a constant stream of non-errors on its error channel.

---

## Connectors

The connector is the only environment-specific piece of the event bus. Everything above — generic types, metadata validation, handler dispatch, ack/nack semantics — is implemented once in the publisher and listener, independent of the broker.

### Implementing a connector

To integrate a broker, implement two interfaces:

**Publisher connector:**

```typescript
interface IPublisherConnector {
  status: "STARTED" | "STOPPED";
  start(): Promise<void>;
  stop(): Promise<void>;
  publish(name: string, message: string): Promise<void>;
  onError(handler: (error: unknown) => void): void;
}
```

**Listener connector:**

```typescript
interface IListenerConnector {
  status: "STARTED" | "STOPPED";
  start(): Promise<void>;
  stop(): Promise<void>;
  onMessage(handler: (message: ReceivedMessage) => Promise<void>): void;
  onError(handler: (error: unknown) => void): void;
}
```

**Received message:**

```typescript
interface ReceivedMessage {
  name: string; // Event name, used to route to the right handler
  content: string; // JSON-serialized { event, metadata } envelope
  ack(): Promise<void>;
  nack(): Promise<void>;
}
```

That's the full contract. The listener calls `ack()` after your handler resolves successfully, and `nack()` if it throws. How ack/nack are implemented is entirely up to the connector — requeue, dead-letter, or discard are all valid choices depending on your broker and your requirements.

### Supported brokers

The connector interfaces are intentionally thin. Any broker that can route named messages and support acknowledgments fits the model:

| Broker             | Notes                                                                           |
| ------------------ | ------------------------------------------------------------------------------- |
| **AWS SQS**        | One queue per event name, or a single queue with message attributes for routing |
| **Apache Kafka**   | Topic per event name, or a single topic with the event name in the key          |
| **Google Pub/Sub** | One topic per event, subscription per listener                                  |
| **RabbitMQ**       | Topic exchanges with the event name as the routing key                          |
| **Redis Streams**  | Stream per event name, consumer groups for competing consumers                  |

---

## In-memory connectors

`ontologic` ships in-memory connectors out of the box:

```typescript
import { InMemoryConnectors } from "ontologic";

const { publisherConnector, listenerConnector } = InMemoryConnectors.create();

const publisher = new DomainEventBusPublisher<OrderEvents>({
  publisherConnector,
});
const listener = new DomainEventBusListener<OrderEvents>({
  listenerConnector,
  options: { validator: parseOrderEvents },
});
```

The two connectors share an internal `EventEmitter`. Publishing an event immediately delivers it to any registered listener in the same process.

**These connectors are intended for tests and local prototyping only.** They have no persistence, no retry logic, no dead-letter queue, and no cross-process delivery. If the process restarts, unprocessed messages are gone. Ack and nack are no-ops. Do not use them in production.

### Using in-memory connectors in tests

```typescript
import {
  InMemoryConnectors,
  DomainEventBusPublisher,
  DomainEventBusListener,
} from "ontologic";

test("listener receives published events", async () => {
  const { publisherConnector, listenerConnector } = InMemoryConnectors.create();

  const publisher = new DomainEventBusPublisher<OrderEvents>({
    publisherConnector,
  });
  const listener = new DomainEventBusListener<OrderEvents>({
    listenerConnector,
    options: { validator: parseOrderEvents },
  });

  const received: OrderPlaced[] = [];

  listener.listenTo("ORDER_PLACED", async (event) => {
    received.push(event as OrderPlaced);
  });

  await listener.start();
  await publisher.start();

  await publisher.publish(
    new OrderPlaced("order-1", { orderId: "order-1", total: 50 }),
    { id: "evt-1", createdAt: new Date().toISOString() },
  );

  expect(received).toHaveLength(1);
  expect(received[0].payload.total).toBe(50);

  await publisher.stop();
  await listener.stop();
});
```

Each test gets its own `InMemoryConnectors.create()` call, so there is no shared state between tests.

---

## Validating event shape

A validator is **required** on the listener.

Events travel over the wire as JSON. When the listener receives a message and deserializes it, the result is a plain JavaScript object — not an instance of your `DomainEvent` class. Without a validator, your handler receives a structurally correct object but one that is missing the class identity: `instanceof` checks fail, prototype methods are absent, and any class-level invariants you rely on are silently bypassed.

The validator is the step that reconstructs a real event instance from the raw wire payload:

```typescript
import { DomainEvent } from "ontologic";

// with a schema library like Zod
const OrderPlacedSchema = z.object({
  entityId: z.string().min(1),
  name: z.literal("ORDER_PLACED"),
  version: z.literal(1),
  payload: z.object({ orderId: z.string(), total: z.number() }),
});

function parseOrderPlaced(raw: unknown): OrderPlaced {
  const data = OrderPlacedSchema.parse(raw);
  return new OrderPlaced(data.entityId, data.payload);
}
```

Pass the validator when constructing the listener:

```typescript
const listener = new DomainEventBusListener<OrderEvents>({
  listenerConnector: myConnector,
  options: {
    validator: parseOrderPlaced,
  },
});
```

The validator runs after deserialization and before your handler is called. If it throws, the message is nack'd, the error is reported through `onError`, and your handler is never invoked.

---

## Error handling

Both the publisher and listener surface connector-level errors through an `onError` callback. Wire it up before calling `start()`:

```typescript
publisher.onError((error) => {
  logger.error("event bus publisher error", { error });
});

listener.onError((error) => {
  logger.error("event bus listener error", { error });
});
```

Handler-level errors (thrown inside a `listenTo` callback) result in an automatic `nack()` and are reported through `onError`. Events with no matching handler do not reach `onError` — they are acknowledged and reported through `onUnhandled` instead, because an event you did not subscribe to is not a failure.

---

## Lifecycle

Both publisher and listener follow the same lifecycle:

1. **Configure** — pass connectors and options to the constructor
2. **Register handlers** (listener only) — call `listenTo` before `start`
3. **Start** — call `start()` to initialize the connector and begin processing
4. **Stop** — call `stop()` to drain and shut down cleanly

```typescript
await publisher.start();
// ... publish events
await publisher.stop();

await listener.start();
// ... process events
await listener.stop();
```

Starting a publisher or listener whose connector is already started, or stopping one that is already stopped, has no effect.
