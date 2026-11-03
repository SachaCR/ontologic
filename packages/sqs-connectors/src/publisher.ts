import type { IPublisherConnector } from "ontologic";

import { assertStandardQueueName, type SqsConnectionOptions } from "./client";
import { SqsPublisherBase } from "./publisherBase";

/**
 * Publishes onto an SQS standard queue, with no ordering.
 *
 * For event publishers whose consumers do not need events in order. A standard
 * queue has no message groups, so `orderingKey` is accepted, as the interface
 * allows, and ignored. Use `SqsOrderedPublisher` on a FIFO queue when order
 * matters.
 */
export class SqsPublisher
  extends SqsPublisherBase
  implements IPublisherConnector
{
  public readonly name: string = "SQS/Publisher";
  public readonly kind = "publisher";

  constructor(options: SqsConnectionOptions) {
    assertStandardQueueName("SQS/Publisher", options.queueName);
    super(options);
  }

  async publish(
    message: string,
    _options?: { orderingKey?: string },
  ): Promise<void> {
    await this.sendMessage(message);
  }
}
