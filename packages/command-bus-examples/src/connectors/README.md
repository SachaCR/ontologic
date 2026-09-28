# Connectors

The connectors themselves now live in their own packages:

- [`@ontologics/redis-connectors`](../../../redis-connectors) — streams for commands, pub/sub for
  responses
- [`@ontologics/sqs-connectors`](../../../sqs-connectors) — SQS FIFO for commands

What stays here is the **contract** they have to satisfy, and the harnesses that run it against
real brokers. Each package's own README covers its transport and its operational gotchas.

A connector is **transport only**. It moves opaque strings and knows nothing
about commands, responses or JSON — both buses do all the serializing. If you
find yourself reaching for `JSON.parse` in here, the abstraction has slipped.

## The interfaces

They live in `ontologic` (`src/bus-connectors/interfaces.ts`). A command bus
needs four of the five:

| Interface | `kind` | Used for | Beyond `BusConnector` |
|---|---|---|---|
| `IOrderedListenerConnector` | `"ordered-listener"` | receiving commands | `onMessage(handler)`, `topicName()` |
| `IOrderedPublisherConnector` | `"ordered-publisher"` | sending commands | `publish(message, { orderingKey })` |
| `IListenerConnector` | `"listener"` | receiving responses | `onMessage(handler)`, `topicName()` |
| `IDynamicPublisherConnector` | `"dynamic-publisher"` | sending responses | `publishTo({ topicName, message })` |
| `IPublisherConnector` | `"publisher"` | the event bus | `publish(message, options?)` |

All extend `BusConnector`: `kind`, `status`, `start()`, `stop()`, `onError(handler)`,
`checkConnection()`. A delivered message is
`{ content: string; ack(): Promise<void>; nack(): Promise<void> }`.

### Why `kind` exists

Several of these are structurally identical — a listener and an ordered listener
have exactly the same members — so without a discriminator TypeScript accepts
either wherever the other is asked for. That is not hypothetical: a pub/sub
listener wired in where a stream consumer belonged compiled cleanly and showed
up only as a five-second timeout. Declare it as a literal:

```ts
export class RedisOrderedListener implements IOrderedListenerConnector {
  public readonly kind = "ordered-listener";
  // ...
}
```

Because one literal cannot satisfy two interfaces, a class implements exactly
one role. That is why the in-memory set ships five classes over two shared bases.

## Why the response side is dynamic

Each emitter owns a response topic and announces it — `topicName()` on its
response listener — inside every command it sends. The receiver publishes the
answer back to whatever name arrived with the command. That is what lets many
emitters share one receiver, and it is why the response publisher takes a topic
per call while the command publisher does not.

## Ordering

`orderingKey` is the caller's grouping, usually the aggregate id. Commands
sharing a key must reach the handler in the order they were published. Commands
with different keys have no ordering relationship, which is what lets a broker
parallelise them.

Read that as a constraint on the *whole path*, not just the publish, and note
that the two transports differ on exactly this point.

**Redis** appends to one stream, which is ordered — but a consumer group spreads
entries across its consumers, so two commands sharing a key can be handled
concurrently by two of them. Order survives only while a single consumer reads
the stream. Partitioning by a hash of `orderingKey`, one consumer per partition,
is what buys it back under parallelism.

**SQS FIFO does not have this problem.** It holds back the rest of a message
group until the in-flight message is deleted or becomes visible again, so
`orderingKey` → `MessageGroupId` gives per-key ordering with any number of
listeners, while different keys still run in parallel. `sqs.test.ts` pins it:
three listeners, three keys, twelve commands — every key stays in order and no
key is split across listeners.

## Verifying a new connector

`__tests__/contract.ts` holds the behaviour every implementation owes:

```ts
export interface ConnectorContractHarness {
  /** A fresh, unstarted connector set. Called once per test. */
  create: () => Promise<CommandBusConnectors> | CommandBusConnectors;
  /** Release whatever `create` opened. */
  destroy?: (connectors: CommandBusConnectors) => Promise<void> | void;
  /** Round-trip budget. The default suits an in-process fake; raise it for a broker. */
  timeout?: number;
}
```

`__tests__/inMemory.test.ts` is the whole of what a run costs when there is
nothing to tear down:

```ts
testCommandBusConnectors("in-memory", {
  create: () => new InMemoryCommandBusConnectors(),
});
```

`__tests__/redis.test.ts` shows what a real broker adds. Four things matter
there, and each one is a bug the suite hit first:

```ts
const REDIS_URL = process.env["REDIS_URL"];
let counter = 0;

const harness: ConnectorContractHarness = {
  create: () => {
    counter += 1;
    return new RedisCommandBusConnectors({
      redisUrl: REDIS_URL ?? "redis://127.0.0.1:6379",
      // A namespace per test: a stream, its consumer group and its pending list
      // all outlive the test that made them, so a shared topic means every test
      // starts by draining the last one's leftovers.
      namespace: `${process.pid}-${Date.now()}-${counter}`,
    });
  },

  // Without this every test leaks its clients and vitest may not exit.
  destroy: (connectors) => (connectors as RedisCommandBusConnectors).disconnect(),

  // A socket, against the in-process fake's 2s default.
  timeout: 10_000,
};

// Opt-in: defaulting to localhost makes `pnpm test` red for anyone — CI
// included — without a Redis running.
describe.skipIf(!REDIS_URL)("redis (set REDIS_URL to run)", () => {
  testCommandBusConnectors("redis", harness);
});
```

Run them with:

```bash
REDIS_URL=redis://127.0.0.1:6379 pnpm --filter command-bus-examples test
```

The third case in the contract — three commands in flight at once, each
receiving its own answer — is the one a real broker is most likely to fail. The
bus correlates on `commandId`, so a connector that duplicates or crosses
responses is caught by it.

## What ships today

Both halves of the recommended production shape now ship: **SQS FIFO for commands, Redis pub/sub
for responses.** You can also run Redis for both, which is what `redis.test.ts` exercises. See
each package's README for its files, its caveats and how to configure it.

### Why the response side is not SQS

An earlier note here imagined one SQS response queue per emitter. That does not
work. SQS has no ephemeral queue: no auto-delete, no TTL on the queue itself,
and `DeleteQueue` takes up to 60 seconds and blocks re-creating the same name
for another 60. A per-caller response channel would mean provisioning and
reaping real infrastructure on every process start.

A Redis pub/sub channel is the opposite: it is not an object at all. Publishing
to a channel nobody listens to returns zero receivers and drops the message; the
channel never enters the keyspace and never needs cleaning up. That is exactly
the semantics a response wants, since a response whose caller has already timed
out is worth nothing.

If everything must be AWS, the shape to reach for is AWS's own
[virtual queues](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-temporary-queues.html):
one real host queue per process, many logical response channels multiplexed onto
it by a message attribute. `responseTopicName` already travels inside every
command and is already opaque to the bus, so it would carry the
`hostQueueUrl#virtualName` form with no change to any interface.
