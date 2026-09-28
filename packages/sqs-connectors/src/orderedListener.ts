import { EventEmitter } from "node:events";
import {
  ChangeMessageVisibilityCommand,
  DeleteMessageCommand,
  GetQueueAttributesCommand,
  ReceiveMessageCommand,
  type Message,
  type SQSClient,
} from "@aws-sdk/client-sqs";
import type {
  IOrderedListenerConnector,
  BusConnectorStatus,
  ReceivedMessage,
} from "ontologic";

import {
  assertFifoQueueName,
  createSqsClient,
  resolveQueueUrl,
  type SqsConnectionOptions,
} from "./client";

export interface SqsOrderedListenerOptions extends SqsConnectionOptions {
  /** Long-poll duration, 20s max. Lower it in tests; the abort on stop() covers shutdown. */
  waitTimeSeconds?: number;
  /** Batch ceiling, 10 max. A batch is processed one message at a time regardless. */
  maxMessages?: number;
}

/**
 * Consumes commands from an SQS FIFO queue.
 *
 * ORDERING: unlike the Redis stream listener, this one keeps per-key order even
 * with several instances running against the same queue. SQS holds back the
 * rest of a message group until the in-flight message is deleted or becomes
 * visible again, so `orderingKey` ordering is enforced by the broker rather
 * than by running exactly one consumer. Different keys still process in
 * parallel.
 *
 * Two things that will break that guarantee, neither of which the code can
 * check for you:
 *
 *   - A handler slower than the queue's visibility timeout. The message is
 *     redelivered *and* its group unblocks early, so a second command from the
 *     same key can overtake the first.
 *   - A poison message with no redrive policy. `nack` releases it immediately,
 *     so without a dead-letter queue and a `maxReceiveCount` it will be
 *     redelivered forever, and its group never advances.
 */
export class SqsOrderedListener implements IOrderedListenerConnector {
  public readonly name: string = "SQS/OrderedListener";
  public readonly kind = "ordered-listener";

  #eventEmitter: EventEmitter;
  #status: BusConnectorStatus;
  #options: SqsOrderedListenerOptions;
  #waitTimeSeconds: number;
  #maxMessages: number;

  #client: SQSClient;
  #queueUrl: string | undefined;
  #handler?: (message: ReceivedMessage) => Promise<void>;

  /** Cuts an in-flight long poll short when stop() is called. */
  #abortController: AbortController | undefined;
  /** Resolves once the poll loop has actually left its receive call. */
  #polling: Promise<void> | undefined;

  constructor(options: SqsOrderedListenerOptions) {
    assertFifoQueueName(this.name, options.queueName);

    this.#eventEmitter = new EventEmitter({ captureRejections: true });
    this.#options = options;
    this.#waitTimeSeconds = options.waitTimeSeconds ?? 20;
    this.#maxMessages = options.maxMessages ?? 10;
    this.#client = createSqsClient(options);
    this.#status = "STOPPED";
  }

  onMessage(handler: (message: ReceivedMessage) => Promise<void>) {
    this.#handler = handler;
  }

  /**
   * Required by the interface and otherwise unused: the only `topicName()` call
   * in the whole bus is on the *response* listener, where the emitter reads it
   * to tell the receiver where to reply. Nothing reads it on the command side.
   */
  topicName(): string {
    return this.#options.queueName;
  }

  get status(): BusConnectorStatus {
    return this.#status;
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

  onError(handler: (error: Error) => void): void {
    this.#eventEmitter.on("failure", (error) => {
      handler(error instanceof Error ? error : new Error(String(error)));
    });
  }

  async start(): Promise<void> {
    if (this.#status === "STARTED") {
      return;
    }

    if (this.#handler === undefined) {
      throw new Error(`[${this.name}] No handler set on message`);
    }

    const handler = this.#handler;

    try {
      this.#queueUrl = await resolveQueueUrl(
        this.name,
        this.#client,
        this.#options,
      );

      const abortController = new AbortController();
      this.#abortController = abortController;
      this.#status = "STARTED";

      // Not awaited: the loop runs for the lifetime of the connector. stop()
      // flips the status, aborts the poll and waits on this handle.
      this.#polling = this.#poll(
        handler,
        this.#queueUrl,
        abortController.signal,
      );
    } catch (error: unknown) {
      throw new Error(
        `[${this.name}] Failed to start for queue "${this.#options.queueName}"`,
        { cause: error },
      );
    }
  }

  async stop(): Promise<void> {
    if (this.#status === "STOPPED") {
      return;
    }

    // Flip first so the loop sees it, then cut the long poll short rather than
    // waiting out its remaining seconds.
    this.#status = "STOPPED";
    this.#abortController?.abort();

    try {
      await this.#polling;
      this.#polling = undefined;
      this.#abortController = undefined;
      this.#queueUrl = undefined;

      this.#client.destroy();
    } catch (error: unknown) {
      throw new Error(`[${this.name}] Failed to stop`, { cause: error });
    }
  }

  async #poll(
    handler: (message: ReceivedMessage) => Promise<void>,
    queueUrl: string,
    abortSignal: AbortSignal,
  ): Promise<void> {
    while (this.#status === "STARTED") {
      try {
        const received = await this.#client.send(
          new ReceiveMessageCommand({
            QueueUrl: queueUrl,
            MaxNumberOfMessages: this.#maxMessages,
            WaitTimeSeconds: this.#waitTimeSeconds,
          }),
          { abortSignal },
        );

        // Sequential on purpose. A FIFO batch can hold several messages from one
        // group, and handling them concurrently would throw away the ordering
        // that is the entire reason for being on a FIFO queue.
        for (const message of received.Messages ?? []) {
          if (this.#status !== "STARTED") {
            break;
          }

          await this.#dispatch(handler, queueUrl, message);
        }
      } catch (error: unknown) {
        if (this.#status !== "STARTED") {
          // The poll was aborted by stop(). Expected, not a failure.
          return;
        }

        this.#eventEmitter.emit("failure", error);
      }
    }
  }

  async #dispatch(
    handler: (message: ReceivedMessage) => Promise<void>,
    queueUrl: string,
    message: Message,
  ): Promise<void> {
    const { Body: content, ReceiptHandle: receiptHandle } = message;

    if (content === undefined || receiptHandle === undefined) {
      this.#eventEmitter.emit(
        "failure",
        new Error(
          `[${this.name}] Received a message with no body or receipt handle`,
        ),
      );

      return;
    }

    try {
      await handler({
        content,
        ack: () => this.#deleteMessage(queueUrl, receiptHandle),
        // Releases the message *and its group* at once. Leaving it to time out
        // would stall every other command sharing its ordering key for the
        // whole visibility timeout.
        nack: () => this.#releaseMessage(queueUrl, receiptHandle),
      });
    } catch (error: unknown) {
      this.#eventEmitter.emit("failure", error);
    }
  }

  async #deleteMessage(queueUrl: string, receiptHandle: string): Promise<void> {
    try {
      await this.#client.send(
        new DeleteMessageCommand({
          QueueUrl: queueUrl,
          ReceiptHandle: receiptHandle,
        }),
      );
    } catch (error: unknown) {
      this.#eventEmitter.emit(
        "failure",
        new Error(`[${this.name}] Failed to ack a message`, { cause: error }),
      );
    }
  }

  async #releaseMessage(
    queueUrl: string,
    receiptHandle: string,
  ): Promise<void> {
    try {
      await this.#client.send(
        new ChangeMessageVisibilityCommand({
          QueueUrl: queueUrl,
          ReceiptHandle: receiptHandle,
          VisibilityTimeout: 0,
        }),
      );
    } catch (error: unknown) {
      this.#eventEmitter.emit(
        "failure",
        new Error(`[${this.name}] Failed to nack a message`, { cause: error }),
      );
    }
  }
}
