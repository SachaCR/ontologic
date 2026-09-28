import {
  GetQueueAttributesCommand,
  SendMessageCommand,
  type SQSClient,
} from "@aws-sdk/client-sqs";
import type { IOrderedPublisherConnector, BusConnectorStatus } from "ontologic";

import {
  assertFifoQueueName,
  assertOrderingKey,
  createSqsClient,
  resolveQueueUrl,
  type SqsConnectionOptions,
} from "./client";

/**
 * Publishes commands onto an SQS FIFO queue.
 *
 * `orderingKey` becomes the `MessageGroupId`, and that mapping is the whole
 * reason to prefer SQS here: SQS will not deliver another message from a group
 * until the one in flight is deleted or becomes visible again, so per-key
 * ordering survives all the way to the handler *even with several listeners
 * running*. The Redis stream connectors carry a caveat saying the opposite —
 * a consumer group spreads entries across consumers and loses per-key order.
 * That caveat does not apply here.
 */
export class SqsOrderedPublisher implements IOrderedPublisherConnector {
  public readonly name: string = "SQS/OrderedPublisher";
  public readonly kind = "ordered-publisher";

  #status: BusConnectorStatus;
  #options: SqsConnectionOptions;
  #client: SQSClient;
  #queueUrl: string | undefined;

  constructor(options: SqsConnectionOptions) {
    assertFifoQueueName(this.name, options.queueName);

    this.#options = options;
    this.#client = createSqsClient(options);
    this.#status = "STOPPED";
  }

  /**
   * Sends the command, tagged with its ordering key.
   *
   * No `MessageDeduplicationId` is set: this connector only ever sees an opaque
   * string and cannot read the command's id, so the queue's
   * `ContentBasedDeduplication` hashes the body instead. That is not a
   * compromise — commands carry a unique id so their bodies differ, and a
   * producer retry after a lost acknowledgement is deduped inside the 5-minute
   * window, which makes the retry idempotent.
   */
  async publish(
    message: string,
    options: { orderingKey: string },
  ): Promise<void> {
    assertOrderingKey(this.name, options.orderingKey);

    const queueUrl = this.#requireQueueUrl();

    try {
      await this.#client.send(
        new SendMessageCommand({
          QueueUrl: queueUrl,
          MessageBody: message,
          MessageGroupId: options.orderingKey,
        }),
      );
    } catch (error: unknown) {
      throw new Error(
        `[${this.name}] Failed to publish to queue "${this.#options.queueName}"`,
        { cause: error },
      );
    }
  }

  topicName(): string {
    return this.#options.queueName;
  }

  get status(): BusConnectorStatus {
    return this.#status;
  }

  /**
   * Resolves the queue URL up front, so a missing or misconfigured queue fails
   * at boot rather than on the first command anyone tries to send.
   */
  async start(): Promise<void> {
    if (this.#status === "STARTED") {
      return;
    }

    try {
      this.#queueUrl = await resolveQueueUrl(
        this.name,
        this.#client,
        this.#options,
      );

      this.#status = "STARTED";
    } catch (error: unknown) {
      throw new Error(`[${this.name}] Failed to start`, { cause: error });
    }
  }

  async stop(): Promise<void> {
    if (this.#status === "STOPPED") {
      return;
    }

    try {
      this.#client.destroy();
      this.#queueUrl = undefined;
      this.#status = "STOPPED";
    } catch (error: unknown) {
      throw new Error(`[${this.name}] Failed to stop`, { cause: error });
    }
  }

  async checkConnection(): Promise<true> {
    try {
      const queueUrl =
        this.#queueUrl ??
        (await resolveQueueUrl(this.name, this.#client, this.#options));

      await this.#client.send(
        new GetQueueAttributesCommand({
          QueueUrl: queueUrl,
          AttributeNames: ["QueueArn"],
        }),
      );

      return true;
    } catch (error: unknown) {
      throw new Error(`[${this.name}] Failed to check connection`, {
        cause: error,
      });
    }
  }

  /**
   * Registers a handler that will never be called.
   *
   * There is no background work and no client-level error event on an
   * `SQSClient`: every failure here surfaces as a thrown error from `publish`,
   * `start` or `stop`, where the caller can see it. The method exists because
   * `BusConnector` requires it. Saying so is better than keeping an EventEmitter
   * that nothing ever emits on, which is what the Redis connectors did for a
   * while before it was noticed.
   */
  onError(_handler: (error: Error) => void): void {
    return;
  }

  #requireQueueUrl(): string {
    if (this.#queueUrl === undefined) {
      throw new Error(`[${this.name}] Not started`);
    }

    return this.#queueUrl;
  }
}
