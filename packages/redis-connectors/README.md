# @ontologics/redis-connectors

Redis connectors for the [Ontologic](https://ontologic.site) command bus, and the event bus.

```bash
npm install @ontologics/redis-connectors
```

`ontologic` is a peer dependency: these connectors import nothing from it at runtime, only the
connector interfaces, so you and they must agree on one copy of those types.

## What you get

| Export | `kind` | Transport |
|---|---|---|
| `RedisOrderedListener` | `ordered-listener` | Stream + consumer group, for receiving commands |
| `RedisOrderedPublisher` | `ordered-publisher` | `XADD`, for sending commands |
| `RedisListener` | `listener` | `SUBSCRIBE`, for receiving responses |
| `RedisDynamicPublisher` | `dynamic-publisher` | `PUBLISH` to a topic named per call |

The asymmetry is the design. Commands go through a **stream with a consumer group** because a
command is not volatile — someone is blocked waiting for its answer, and it has to survive a
handler crashing, so an entry stays in the pending list until it is acked. Responses go through
**pub/sub** because a response whose caller has already timed out is worth nothing; `ack` and
`nack` are honest no-ops there.

**For the event bus**, use the stream pair: `RedisOrderedPublisher` with `DomainEventBusPublisher`
and `RedisOrderedListener` with `DomainEventBusListener` (the event bus accepts ordered
connectors). Not `RedisListener`: pub/sub keeps nothing, so an event published while no listener is
subscribed is gone. The stream pair keeps the ordering caveat below.

## Usage

```ts
import {
  RedisOrderedListener,
  RedisOrderedPublisher,
  RedisListener,
  RedisDynamicPublisher,
} from "@ontologics/redis-connectors";

const commandOrderedListener = new RedisOrderedListener({
  topicName: "commands",
  redisUrl: process.env.REDIS_URL,
});

const responseListener = new RedisListener({
  topicName: `responses-${process.pid}`,
  redisUrl: process.env.REDIS_URL,
});
```

Each connector opens its own client — node-redis puts a connection into subscriber mode, so a
listener cannot share one with a publisher.

## Two things to know

**`onError()` must be called before `start()`.** With no listener on the client's `error` event,
node-redis abandons its reconnect loop on the first failure, so the backoff never runs and
`start()` fails in milliseconds instead of retrying for ~15s.

**Ordering holds only while a single consumer reads the stream.** A consumer group spreads entries
across its consumers, so two commands sharing an `orderingKey` can be handled concurrently by two
of them. Partitioning the stream by a hash of the key, one consumer per partition, is what buys
ordering back under parallelism. If you need per-key ordering *with* parallelism and can use AWS,
`@ontologics/sqs-connectors` gets it from the broker instead.

**Nothing reclaims the pending list** across consumer names. Recovery works when a process
restarts with the same `consumerName`, but the `consumer-{pid}` default guarantees a new one.
`XAUTOCLAIM` on a timer is the usual answer.

## Conformance

These connectors are exercised by the shared command bus contract in
[`packages/command-bus-examples`](../command-bus-examples), which runs a real emitter and receiver
over a real Redis.
