# @ontologics/sqs-connectors

SQS connectors for the [Ontologic](https://ontologic.site) command bus and event bus.

```bash
npm install @ontologics/sqs-connectors
```

`ontologic` is a peer dependency: these connectors import nothing from it at runtime, only the
connector interfaces, so you and they must agree on one copy of those types.

## What you get

| Export | `kind` | Queue | Use it for |
|---|---|---|---|
| `SqsOrderedPublisher` | `ordered-publisher` | FIFO | Commands, and events whose consumers need order |
| `SqsOrderedListener` | `ordered-listener` | FIFO | Commands, and event consumers that need order |
| `SqsPublisher` | `publisher` | standard | Events whose consumers don't need order |
| `SqsListener` | `listener` | standard | Event consumers that don't need order |

Ordering is your choice on the event bus: `DomainEventBusPublisher` and `DomainEventBusListener`
accept either pair. The command bus needs the ordered pair.

**Responses still go through Redis.** The command bus's response channel wants to be per-caller,
free to create and free to abandon, and SQS has no ephemeral queue: no auto-delete, no TTL on the
queue itself, and `DeleteQueue` takes 60 seconds and blocks re-creating the name for another 60.
Pair these with `@ontologics/redis-connectors` for responses, where a pub/sub channel is not even
allocated until someone subscribes.

## Ordering and parallel groups

On a FIFO queue, `orderingKey` becomes the `MessageGroupId`. `SqsOrderedListener` handles **each
message group in order, and different groups in parallel**:

- Each group gets its own in-memory queue that runs one message at a time.
- SQS will not deliver another message from a group while one of its messages is in flight, so
  per-key order also holds with **several listener instances** running on the same queue.

`SqsListener` has no groups to respect: its messages simply run in parallel.

Both hold at most `maxInFlight` messages at once (default 50), waiting behind their group or being
handled. They only receive into free slots, so no message waits locally long enough to outlive its
visibility timeout. `activeMessageGroups` tells you how many groups currently have work.

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
  maxInFlight: 50,
  maxDeliveries: 5, // commands only, see below
});
```

The unordered pair refuses a `.fifo` name, and the ordered pair requires one.

## Stopping

`stop()` stops receiving, then waits for every message already received to be handled before it
returns. It does **not** abort the long poll in progress: aborting only closes the client's side of
the connection, and SQS keeps the request open and hands it whatever arrives next. Nobody reads that
response, so those messages go invisible for a whole visibility timeout and their callers time out.
Instead the poll is left to finish, and whatever it brings back is handed straight back to the
queue.

So a stop can take up to `waitTimeSeconds` (20 by default, the SQS maximum). Lower it when quick
shutdowns matter more than making fewer requests.

## Failures

**A failure blocks its group.** A message fails when its handler nacks it or throws. The failed
message, and the messages of its group already received behind it, are handed back to SQS with
`nackVisibilitySeconds` of visibility. None of them run. SQS then redelivers the group from the
failed message, in order. Other groups keep running.

**Dropping a message is opt-in: `maxDeliveries`.** Past that many deliveries, a message is discarded:
acked without running the handler, and reported to `onDiscard(message, deliveries)`.

- **Commands:** set it. A poison command that keeps crashing its receiver is dropped, and its group
  moves on to the next command. The caller can send it again.
- **Events:** never set it. An event that keeps failing must block its group until it is processed.
  Skipping it would silently corrupt everything downstream of it.

**`nackVisibilitySeconds` is the retry delay.** It defaults to 0, which releases a nacked message at
once. That is right for commands: the receiver only nacks while it is stopping, so another instance
should take the command right away. For events, set a delay (e.g. 30) so a failing event is not
retried in a tight loop.

## Queue setup

**FIFO queues need `ContentBasedDeduplication`.** A connector only ever sees an opaque string, so
it cannot read the message's id to use as a `MessageDeduplicationId`, and FIFO requires one or the
other. Letting SQS hash the body is not a workaround: messages carry a unique id so bodies differ,
and a producer retry after a lost acknowledgement is deduped inside the 5-minute window, which
makes the retry idempotent. Pass `ensureQueue: true` to have the connector create the queue (FIFO
attributes for a `.fifo` name, none for a standard one). A hand-made FIFO queue without the
attribute will have its publishes rejected.

**The visibility timeout must exceed the handler's worst case.** A message still in flight when it
expires is delivered again: double processing, and worse, its whole group unblocks early, which
quietly breaks the ordering guarantee above.

**Redrive policies:**

- On command queues, a dead-letter queue is a fine backstop next to `maxDeliveries`.
- On event queues, use **no redrive policy, or a very high `maxReceiveCount`**: moving a blocked
  event to a DLQ skips it, which is exactly what blocking is there to prevent.

## Conformance

These connectors are exercised by the shared command bus contract in
[`packages/command-bus-examples`](../command-bus-examples), against LocalStack. Its ordering test
pins the claim above: three listeners, three keys, twelve commands. Every key stays in order and no
key is split across listeners.
