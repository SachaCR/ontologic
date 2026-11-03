import type { IOrderedListenerConnector } from "ontologic";

import { assertFifoQueueName } from "./client";
import { SqsListenerBase, type SqsListenerOptions } from "./listenerBase";

export type SqsOrderedListenerOptions = SqsListenerOptions;

/**
 * Consumes an SQS FIFO queue: **each message group in order, groups in
 * parallel**.
 *
 * `orderingKey` is the `MessageGroupId`. Each group gets its own in-memory queue
 * that runs one message at a time, while different groups run concurrently, up
 * to `maxInFlight` messages. SQS itself holds back the rest of a group while one
 * of its messages is in flight, so per-key order also holds with several
 * instances running against the same queue.
 *
 * Use it for the command bus, and for event consumers that need events in order.
 *
 * FAILURES. A nack, or a handler that throws, blocks the message's group: its
 * queued messages are not run and are handed back with the failed one, so SQS
 * redelivers the group in order. Dropping a poison message is opt-in, through
 * `maxDeliveries`: set it for commands, never for events.
 *
 * Two things that will break ordering, neither of which the code can check:
 *
 *   - A handler slower than the queue's visibility timeout. The message is
 *     redelivered *and* its group unblocks early, so a second message from the
 *     same key can overtake the first.
 *   - For commands, a poison message with no `maxDeliveries` and no redrive
 *     policy: it is redelivered forever, and its group never advances.
 */
export class SqsOrderedListener
  extends SqsListenerBase
  implements IOrderedListenerConnector
{
  public readonly name: string = "SQS/OrderedListener";
  public readonly kind = "ordered-listener";

  constructor(options: SqsOrderedListenerOptions) {
    assertFifoQueueName("SQS/OrderedListener", options.queueName);
    super(options);
  }
}
