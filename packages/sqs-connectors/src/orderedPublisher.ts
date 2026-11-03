import type { IOrderedPublisherConnector } from "ontologic";

import {
  assertFifoQueueName,
  assertOrderingKey,
  type SqsConnectionOptions,
} from "./client";
import { SqsPublisherBase } from "./publisherBase";

/**
 * Publishes onto an SQS FIFO queue.
 *
 * `orderingKey` becomes the `MessageGroupId`, and that mapping is the whole
 * reason to prefer SQS here: SQS will not deliver another message from a group
 * until the one in flight is deleted or becomes visible again, so per-key
 * ordering survives all the way to the handler *even with several listeners
 * running*. The Redis stream connectors carry a caveat saying the opposite —
 * a consumer group spreads entries across consumers and loses per-key order.
 * That caveat does not apply here.
 *
 * For the command bus, and for event publishers whose consumers need order.
 */
export class SqsOrderedPublisher
  extends SqsPublisherBase
  implements IOrderedPublisherConnector
{
  public readonly name: string = "SQS/OrderedPublisher";
  public readonly kind = "ordered-publisher";

  constructor(options: SqsConnectionOptions) {
    assertFifoQueueName("SQS/OrderedPublisher", options.queueName);
    super(options);
  }

  /**
   * Sends the message, tagged with its ordering key.
   *
   * No `MessageDeduplicationId` is set: this connector only ever sees an opaque
   * string and cannot read the message's id, so the queue's
   * `ContentBasedDeduplication` hashes the body instead. That is not a
   * compromise — commands and events carry a unique id so their bodies differ,
   * and a producer retry after a lost acknowledgement is deduped inside the
   * 5-minute window, which makes the retry idempotent.
   */
  async publish(
    message: string,
    options: { orderingKey: string },
  ): Promise<void> {
    assertOrderingKey(this.name, options.orderingKey);

    await this.sendMessage(message, options.orderingKey);
  }
}
