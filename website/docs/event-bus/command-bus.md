---
sidebar_position: 3
---

# Command Bus

The [event bus](./event-bus.md) is fire-and-forget: a publisher announces that something happened, and has no idea who listens. A **command bus** is the opposite. It is request/response over a broker: a caller sends a command to whichever service handles it and **waits for the answer**, with a timeout.

`ontologic` ships a typed command bus with an **emitter** (the caller side) and a **receiver** (the handler side), backed by the same pluggable connectors as the event bus.

---

## Core concepts

A command bus is two one-way channels, not one duplex channel:

```
commands   emitter  --ordered publish-->  receiver   (one topic, ordered by key)
responses  receiver --dynamic publish-->  emitter    (one topic per emitter)
```

### Emitter

`CommandBusEmitter` publishes a command, then waits for the matching response on its own response topic. `send()` resolves with a `Result`: `Ok(payload)` when the handler succeeded, or `Err(error)` when it refused, threw, or did not answer in time.

### Receiver

`CommandBusReceiver` consumes commands, runs your handler, and publishes the response back to the topic the emitter named in the command. That is why the response side is a **dynamic** publisher: many emitters can share one receiver, each with its own response topic.

### Commands

A command is a JSON-serializable envelope:

```typescript
interface BusCommand {
  id: string; // unique per command, used to match the response
  name: string;
  payload: unknown;
  metadata: unknown;
}
```

Narrow `payload` and `metadata` to make a command yours:

```typescript
import type { BusCommand } from "ontologic";

interface PlaceOrder extends BusCommand {
  name: "PlaceOrder";
  payload: {
    orderId: string;
    items: { sku: string; quantity: number }[];
  };
  metadata: { correlationId: string };
}
```

:::warning
The receiver checks the envelope (`id`, `name`, and that `payload` and `metadata` are present), not your payload. The `Command` type parameter is trust, not validation. Validate the payload at the top of your handler.
:::

---

## Handling commands

A handler returns a [`Result`](../domain-model/result-pattern.md). A business refusal is a value, not an exception:

```typescript
import { DomainError, err, ok, type CommandHandlerResponse } from "ontologic";

async function handlePlaceOrder(
  command: PlaceOrder,
): Promise<CommandHandlerResponse> {
  const { orderId, items } = command.payload;

  if (items.length === 0) {
    return err(
      new DomainError({
        name: "EMPTY_ORDER",
        message: `Order ${orderId} has no item`,
        context: { orderId },
      }),
    );
  }

  return ok({ orderId, status: "PLACED" });
}

const receiver = new CommandBusReceiver<PlaceOrder>({
  commandSubscriber: commandOrderedListener,
  responsePublisher: responseDynamicPublisher,
});

receiver.process(handlePlaceOrder);
await receiver.start();
```

You must call `process()` before `start()`. Starting without a handler throws.

Throwing works too: the receiver catches it and answers with a failure. Keep throwing for the genuinely unexpected.

---

## Sending commands

```typescript
const emitter = new CommandBusEmitter<PlaceOrder>(
  {
    commandPublisher: commandOrderedPublisher,
    responseSubscriber: responseListener,
  },
  { timeout: 5000 }, // default: 10000ms
);

await emitter.start();

const result = await emitter.send(
  {
    command: {
      id: crypto.randomUUID(),
      name: "PlaceOrder",
      payload: { orderId: "order-1", items: [{ sku: "BOOK-1", quantity: 2 }] },
      metadata: { correlationId: "corr-1" },
    },
    // Commands sharing a key are handled in order.
    orderingKey: "order-1",
  },
  { timeout: 2000 }, // optional, per call
);

if (result.isErr()) {
  console.log(result.error.name, result.error.message);
}
```

`send()` **throws** rather than returning an `Err` when the command never left. That happens when the emitter is not started, the command fails envelope validation, another command with the same `id` is already in flight, or the publish itself fails. Once the command is on the broker, every outcome is a `Result`.

### Failure responses

Every `Err` coming out of `send()` keeps the full wire error as its `cause`, including a `code` and a `context`:

| Situation | `error.name` | `cause.code` | `cause.context` |
| --- | --- | --- | --- |
| Handler returned `err(error)` | the error's name | the error's `code`, or `COMMAND_REJECTED` | the error's `context` (e.g. a `DomainError`), or `null` |
| Handler threw | the thrown error's name | its `code`, or `HANDLER_THREW` | its `context`, or `null` |
| No answer within the timeout | `TIMEOUT_ERROR` | `COMMAND_TIMEOUT` | `{ commandId }` |
| Still waiting when a forced `stop()` gives up | `EMITTER_STOPPED_ERROR` | `EMITTER_STOPPED` | `{ commandId }` |

```typescript
if (result.isErr()) {
  const wire = result.error.cause as { code: string; context: unknown };

  if (wire.code === "COMMAND_TIMEOUT") {
    // The command may still have been handled. See below.
  }
}
```

A handler's error `context` crosses the wire as JSON. Keep it serializable.

---

## Delivery guarantees

- **The receiver acks once the handler has returned**, whatever it returned. A command that failed is not retried by the bus.
- **A receiver that crashes mid-handler** leaves the command unacked, so the broker can deliver it again. SQS does this once the visibility timeout expires. Redis does it only when a consumer with the same name restarts. Either way, a handler can run more than once for the same command.
- **A timeout or a forced stop does not cancel anything.** The command was published, and a receiver may still handle it.

So make handlers idempotent on `command.id`. On a timeout, check whether the command was handled before retrying it.

---

## Lifecycle

```typescript
await receiver.start();
await emitter.start();
// ...
await emitter.stop();
await receiver.stop();
```

Starting something already started, or stopping something already stopped, has no effect.

`stop()` is graceful on both sides, like an HTTP server draining its connections: it refuses new work, waits for in-flight work to finish, and only then stops the connectors. While it drains, `status()` reports `STOPPING`.

- **Emitter:** new `send()` calls throw. Commands already sent keep waiting for their response, and the response listener stays up to deliver it. Each one is bounded by its timeout, so `stop()` resolves at the latest when the longest remaining timeout expires.
- **Receiver:** the command listener stops first, so nothing new comes in, and a command that still arrives is nacked back to the broker for another receiver. Handlers already running finish, and their responses are still published. The response publisher stops last.

The drain has a hard limit, **2 minutes by default**, so a handler that never returns cannot hold the shutdown forever. Pass your own as `stop({ timeout })`, in milliseconds:

```typescript
await emitter.stop({ timeout: 20_000 });
await receiver.stop({ timeout: 20_000 });
```

When the limit hits, `stop()` stops the connectors anyway, resolves, and reports what it abandoned through `onError`:

- **Emitter:** commands still waiting resolve with an `EMITTER_STOPPED` failure.
- **Receiver:** commands still being handled were never acked, so the broker can deliver them again. That's one more reason to make handlers idempotent.

In a process that runs both, stop the emitter before the receiver. Set your platform's shutdown grace period above the stop limit, or lower the limit to fit it. Kubernetes defaults to 30 seconds, so with the 2-minute default you'd pass something like `stop({ timeout: 25_000 })`.

Both sides expose `onError(handler)` for connector failures and malformed messages, `status()`, and `checkConnection()`. The emitter also exposes `metrics()`, which returns `{ inFlightCommands }`.

---

## Connectors

The command bus needs four connectors, all from the shared bus connector contract:

| Role | Interface | `kind` |
| --- | --- | --- |
| Emitter publishes commands | `IOrderedPublisherConnector` | `ordered-publisher` |
| Receiver consumes commands | `IOrderedListenerConnector` | `ordered-listener` |
| Receiver publishes responses | `IDynamicPublisherConnector` | `dynamic-publisher` |
| Emitter consumes responses | `IListenerConnector` | `listener` |

```typescript
interface IOrderedPublisherConnector {
  readonly kind: "ordered-publisher";
  publish(message: string, options: { orderingKey: string }): Promise<void>;
  // + status, start, stop, onError, checkConnection
}

interface IDynamicPublisherConnector {
  readonly kind: "dynamic-publisher";
  publishTo(params: { topicName: string; message: string }): Promise<void>;
  // + status, start, stop, onError, checkConnection
}
```

The listener interfaces are the ones described on the [event bus page](./event-bus.md#implementing-a-connector). The emitter reads `topicName()` on its response listener to tell receivers where to reply.

Commands and responses want different transports. A command is not volatile: someone is waiting for its answer, and it must survive a crashed handler, so it belongs on a durable, ordered queue. A response whose caller has already timed out is worth nothing, so cheap pub/sub fits.

### In-memory

For tests and local prototyping:

```typescript
import { InMemoryCommandBusConnectors } from "ontologic";

const connectors = new InMemoryCommandBusConnectors();

const receiver = new CommandBusReceiver<PlaceOrder>({
  commandSubscriber: connectors.commandOrderedListener,
  responsePublisher: connectors.responseDynamicPublisher,
});

const emitter = new CommandBusEmitter<PlaceOrder>({
  commandPublisher: connectors.commandOrderedPublisher,
  responseSubscriber: connectors.responseListener,
});
```

Same caveats as the event bus in-memory connectors: single process, no persistence. Do not use them in production.

### Redis and SQS

Production connectors ship as separate packages, so `ontologic` itself stays dependency-free:

| Package | Provides | Use it for |
| --- | --- | --- |
| `@ontologics/redis-connectors` | `RedisOrderedPublisher`, `RedisOrderedListener` (streams + consumer group), `RedisDynamicPublisher`, `RedisListener` (pub/sub) | Both channels |
| `@ontologics/sqs-connectors` | `SqsOrderedPublisher`, `SqsOrderedListener` (FIFO queue, `orderingKey` → `MessageGroupId`) | Commands only. Pair with Redis for responses |

```bash
npm install @ontologics/redis-connectors
npm install @ontologics/sqs-connectors # optional, for commands
```

What to know before running them in production:

- **Redis streams keep per-key order only with a single consumer.** A consumer group spreads entries across consumers. SQS FIFO keeps per-key order across several listeners.
- **Redis: call `onError()` before `start()`**, or node-redis gives up reconnecting on the first failure.
- **SQS: the queue needs `ContentBasedDeduplication`**, a visibility timeout longer than your slowest handler, and a redrive policy for poison messages.

Each package's README has the details.
