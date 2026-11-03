import {
  GetQueueAttributesCommand,
  SendMessageCommand,
  type SQSClient,
} from "@aws-sdk/client-sqs";
import type { BusConnectorStatus, ErrorHandler } from "ontologic";

import {
  createSqsClient,
  resolveQueueUrl,
  type SqsConnectionOptions,
} from "./client";

/**
 * Lifecycle and sending shared by `SqsOrderedPublisher` and `SqsPublisher`.
 * They differ only in what they do with the ordering key.
 */
export abstract class SqsPublisherBase {
  abstract readonly name: string;

  #status: BusConnectorStatus = "STOPPED";
  #options: SqsConnectionOptions;
  #client: SQSClient;
  #queueUrl: string | undefined;

  constructor(options: SqsConnectionOptions) {
    this.#options = options;
    this.#client = createSqsClient(options);
  }

  /** Sends one message, in `messageGroupId`'s group when there is one. */
  protected async sendMessage(
    message: string,
    messageGroupId?: string,
  ): Promise<void> {
    const queueUrl = this.#requireQueueUrl();

    try {
      await this.#client.send(
        new SendMessageCommand({
          QueueUrl: queueUrl,
          MessageBody: message,
          ...(messageGroupId === undefined
            ? {}
            : { MessageGroupId: messageGroupId }),
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
   * at boot rather than on the first message anyone tries to send.
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
   * `BusConnector` requires it.
   */
  onError(_handler: ErrorHandler): void {
    return;
  }

  #requireQueueUrl(): string {
    if (this.#queueUrl === undefined) {
      throw new Error(`[${this.name}] Not started`);
    }

    return this.#queueUrl;
  }
}
