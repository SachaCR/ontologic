import { EventEmitter } from "node:events";
import { GetQueueAttributesCommand, type SQSClient } from "@aws-sdk/client-sqs";
import type {
  BusConnectorStatus,
  ErrorHandler,
  ReceivedMessage,
} from "ontologic";

import {
  createSqsClient,
  resolveQueueUrl,
  type SqsConnectionOptions,
} from "./client";
import {
  DEFAULT_MAX_IN_FLIGHT,
  GroupedConsumer,
  MAX_MESSAGES_PER_RECEIVE,
} from "./groupedConsumer";

export interface SqsListenerOptions extends SqsConnectionOptions {
  /**
   * Long-poll duration, 20s max (the default). `stop()` lets the receive in
   * progress finish rather than abort it, so this is also how long a stop can
   * take: lower it when quick shutdowns matter more than fewer requests.
   */
  waitTimeSeconds?: number;
  /** Per-receive ceiling, 10 max. */
  maxMessages?: number;
  /**
   * How many messages this listener holds at once, waiting behind their group
   * or being handled. Defaults to 50. It only receives into free slots, so no
   * message waits locally long enough to outlive its visibility timeout.
   */
  maxInFlight?: number;
  /**
   * Visibility, in seconds, given to a message that is nacked or whose handler
   * throws, and to the messages of its group queued behind it. 0, the default,
   * releases them at once. For events, set it to a retry delay (e.g. 30), so a
   * failing event is not retried in a tight loop.
   */
  nackVisibilitySeconds?: number;
  /**
   * Past this many deliveries, a message is discarded: acked without running
   * the handler, and reported to `onDiscard`. Unset, the default, a message is
   * handled however many times it comes back.
   *
   * For commands, which their caller can send again: a poison command no longer
   * holds its group. **Never set it for events.** An event that keeps failing
   * must block its group until it is processed.
   */
  maxDeliveries?: number;
  /** Told of each discarded message and its number of deliveries, before it is deleted. */
  onDiscard?: (message: ReceivedMessage, deliveries: number) => void;
}

/**
 * Lifecycle shared by `SqsOrderedListener` and `SqsListener`. The consuming
 * itself, groups in parallel, is `GroupedConsumer`'s.
 */
export abstract class SqsListenerBase {
  abstract readonly name: string;

  #eventEmitter = new EventEmitter({ captureRejections: true });
  #status: BusConnectorStatus = "STOPPED";
  #options: SqsListenerOptions;
  #client: SQSClient;
  #queueUrl: string | undefined;
  #handler: ((message: ReceivedMessage) => Promise<void>) | undefined;
  #consumer: GroupedConsumer | undefined;

  constructor(options: SqsListenerOptions) {
    this.#options = options;
    this.#client = createSqsClient(options);
  }

  onMessage(handler: (message: ReceivedMessage) => Promise<void>): void {
    this.#handler = handler;
  }

  topicName(): string {
    return this.#options.queueName;
  }

  get status(): BusConnectorStatus {
    return this.#status;
  }

  /** How many message groups currently have work, for monitoring. */
  get activeMessageGroups(): number {
    return this.#consumer?.activeMessageGroups ?? 0;
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

  onError(handler: ErrorHandler): void {
    this.#eventEmitter.on("failure", handler);
  }

  async start(): Promise<void> {
    if (this.#status === "STARTED") {
      return;
    }

    const handler = this.#handler;

    if (handler === undefined) {
      throw new Error(`[${this.name}] No handler set on message`);
    }

    try {
      this.#queueUrl = await resolveQueueUrl(
        this.name,
        this.#client,
        this.#options,
      );
    } catch (error: unknown) {
      throw new Error(
        `[${this.name}] Failed to start for queue "${this.#options.queueName}"`,
        { cause: error },
      );
    }

    const options = this.#options;

    this.#consumer = new GroupedConsumer({
      connectorName: this.name,
      client: this.#client,
      queueUrl: this.#queueUrl,
      handler,
      emitError: (error) => this.#eventEmitter.emit("failure", error),
      waitTimeSeconds: options.waitTimeSeconds ?? 20,
      maxMessages: options.maxMessages ?? MAX_MESSAGES_PER_RECEIVE,
      maxInFlight: options.maxInFlight ?? DEFAULT_MAX_IN_FLIGHT,
      nackVisibilitySeconds: options.nackVisibilitySeconds ?? 0,
      ...(options.maxDeliveries === undefined
        ? {}
        : { maxDeliveries: options.maxDeliveries }),
      ...(options.onDiscard === undefined
        ? {}
        : { onDiscard: options.onDiscard }),
    });

    this.#status = "STARTED";
    this.#consumer.start();
  }

  /**
   * Stops receiving, waits for every message already received to be handled,
   * and only then destroys the client: a handler finishing up still needs it
   * to ack.
   */
  async stop(): Promise<void> {
    if (this.#status === "STOPPED") {
      return;
    }

    this.#status = "STOPPED";

    try {
      await this.#consumer?.stop();
      this.#consumer = undefined;
      this.#queueUrl = undefined;

      this.#client.destroy();
    } catch (error: unknown) {
      throw new Error(`[${this.name}] Failed to stop`, { cause: error });
    }
  }
}
