# @ontologics/sqs-connectors

SQS FIFO connectors for the [Ontologic](https://ontologic.site) command bus.

```bash
npm install @ontologics/sqs-connectors
```

`ontologic` is a peer dependency: these connectors import nothing from it at runtime, only the
connector interfaces, so you and they must agree on one copy of those types.

## What you get

| Export | `kind` | Transport |
|---|---|---|
| `SqsOrderedListener` | `ordered-listener` | `ReceiveMessage` long-poll loop, for receiving commands |
| `SqsOrderedPublisher` | `ordered-publisher` | `SendMessage`, for sending commands |

**Commands only.** There is no response-side connector here, and that is deliberate: a response
channel wants to be per-caller, free to create and free to abandon, and SQS has no ephemeral queue
— no auto-delete, no TTL on the queue itself, and `DeleteQueue` takes 60 seconds and blocks
re-creating the name for another 60. Pair these with `@ontologics/redis-connectors` for responses,
where a pub/sub channel is not even allocated until someone subscribes.

## Why SQS for commands

`orderingKey` becomes the `MessageGroupId`, and SQS will not deliver another message from a group
until the one in flight is deleted or becomes visible again. So **per-key ordering survives even
with several listeners running**, while different keys still process in parallel. That is the one
thing a Redis stream consumer group cannot give you.

## Usage

```ts
import {
  SqsOrderedListener,
  SqsOrderedPublisher,
  type SqsConnectionOptions,
} from "@ontologics/sqs-connectors";

const options: SqsConnectionOptions = {
  queueName: "commands.fifo", // the .fifo suffix is required and checked
  region: "eu-west-3",
};

const commandOrderedPublisher = new SqsOrderedPublisher(options);
const commandOrderedListener = new SqsOrderedListener({
  ...options,
  waitTimeSeconds: 20,
});
```

## Three things to know

**The queue needs `ContentBasedDeduplication`.** A connector only ever sees an opaque string, so it
cannot read the command's id to use as a `MessageDeduplicationId` — and FIFO requires one or the
other. Letting SQS hash the body is not a workaround: commands carry a unique id so bodies differ,
and a producer retry after a lost acknowledgement is deduped inside the 5-minute window, which
makes the retry idempotent. Pass `ensureQueue: true` to have the connector create the queue with
the attribute set; a hand-made queue without it will have its publishes rejected.

**The visibility timeout must exceed the handler's worst case.** A message still in flight when it
expires is delivered again — double processing, and worse, its whole group unblocks early, which
quietly breaks the ordering guarantee above.

**Poison messages need a redrive policy.** `nack` releases a message immediately, so without a
dead-letter queue and a `maxReceiveCount` it is redelivered forever and its group never advances.

## Conformance

These connectors are exercised by the shared command bus contract in
[`packages/command-bus-examples`](../command-bus-examples), against LocalStack. Its ordering test
pins the claim above: three listeners, three keys, twelve commands — every key stays in order and
no key is split across listeners.
