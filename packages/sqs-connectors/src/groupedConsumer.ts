import { randomUUID } from "node:crypto";
import {
  ChangeMessageVisibilityCommand,
  DeleteMessageCommand,
  ReceiveMessageCommand,
  type Message,
  type SQSClient,
} from "@aws-sdk/client-sqs";
import fastq, { type queueAsPromised } from "fastq";
import type { ReceivedMessage } from "ontologic";

/** SQS returns at most 10 messages per receive. */
export const MAX_MESSAGES_PER_RECEIVE = 10;
export const DEFAULT_MAX_IN_FLIGHT = 50;
export const RECEIVE_ERROR_BACKOFF_MS = 1_000;

export interface GroupedConsumerOptions {
  /** Prefixes every reported error, e.g. `SQS/OrderedListener`. */
  connectorName: string;
  client: Pick<SQSClient, "send">;
  queueUrl: string;
  handler: (message: ReceivedMessage) => Promise<void>;
  emitError: (error: Error) => void;
  waitTimeSeconds: number;
  /** Per-receive ceiling, 10 max. */
  maxMessages: number;
  /** Messages held at once, waiting in a group queue or being handled. */
  maxInFlight: number;
  /** Visibility a nacked or failed message is given: 0 releases it at once. */
  nackVisibilitySeconds: number;
  /** Past this many deliveries a message is discarded. Unset: never. */
  maxDeliveries?: number;
  onDiscard?: (message: ReceivedMessage, deliveries: number) => void;
}

/** A message as received, with how many times SQS has delivered it. */
interface Delivery {
  message: Message & { Body: string; ReceiptHandle: string };
  deliveries: number;
}

interface Group {
  queue: queueAsPromised<Delivery>;
  /** Set once a message of the group failed: the rest must not run before it. */
  blocked: boolean;
}

type Outcome = "pending" | "acked" | "nacked";

/**
 * Consumes an SQS queue **one message group at a time, groups in parallel**.
 *
 * Each `MessageGroupId` gets its own in-memory queue with a concurrency of 1:
 * a group's messages run one after the other, in order, while different groups
 * run concurrently. A group's queue is created on its first message and dropped
 * once it drains, so the map only holds groups with work. A message without a
 * group (a standard queue) gets a queue of its own, so it runs in parallel with
 * everything else.
 *
 * At most `maxInFlight` messages are held at once. The loop only receives into
 * free slots, so no message waits locally long enough to outlive its
 * visibility timeout.
 *
 * FAILURES. A message fails when its handler nacks it or throws. The failed
 * message is given `nackVisibilitySeconds` of visibility, and its group is
 * **blocked**: the group's messages already received behind it are not run.
 * They are given the same visibility, so SQS redelivers the whole group from
 * the failed message, in order. This holds for both buses. An event must not be
 * overtaken by the next one of its group, and the command receiver only nacks
 * while it is stopping, when it refuses every queued command anyway.
 *
 * Dropping a message is a separate, explicit choice: `maxDeliveries`. Past that
 * many deliveries a message is discarded (acked without running the handler)
 * and reported to `onDiscard`. Set it for commands, which their caller can
 * send again. Never for events, which must block their group until they
 * succeed.
 */
export class GroupedConsumer {
  readonly #options: GroupedConsumerOptions;
  readonly #groups = new Map<string, Group>();

  #running = false;
  #loop: Promise<void> | undefined;
  /** Resolves the loop's wait for a free slot or for its backoff. */
  #wakePoll: (() => void) | undefined;

  constructor(options: GroupedConsumerOptions) {
    this.#options = options;
  }

  /** How many message groups currently have work, for monitoring. */
  get activeMessageGroups(): number {
    return this.#groups.size;
  }

  start(): void {
    if (this.#running) {
      return;
    }

    this.#running = true;
    this.#loop = this.#poll();
  }

  /**
   * Stops receiving, then waits for every message already received to be
   * handled, so nothing it needs is closed under it.
   *
   * The receive in progress is left to finish, which takes up to
   * `waitTimeSeconds`, rather than aborted. Aborting only closes the client's
   * side: SQS keeps the long poll open and hands it whatever arrives next,
   * which nobody reads, so those messages go invisible for a whole visibility
   * timeout and their callers time out. Whatever the finishing receive brings
   * back is handed straight back to the queue instead.
   */
  async stop(): Promise<void> {
    if (!this.#running) {
      return;
    }

    this.#running = false;
    this.#wake();

    await this.#loop;
    this.#loop = undefined;

    await Promise.all(
      [...this.#groups.values()].map((group) => group.queue.drained()),
    );
  }

  async #poll(): Promise<void> {
    const { client, queueUrl, waitTimeSeconds } = this.#options;

    while (this.#running) {
      await this.#freeSlot();

      if (!this.#running) {
        break;
      }

      let messages: Message[];

      try {
        const received = await client.send(
          new ReceiveMessageCommand({
            QueueUrl: queueUrl,
            WaitTimeSeconds: waitTimeSeconds,
            MaxNumberOfMessages: Math.min(
              this.#options.maxMessages,
              MAX_MESSAGES_PER_RECEIVE,
              this.#options.maxInFlight - this.#inFlight(),
            ),
            // System attributes: SQS only returns them when asked.
            MessageSystemAttributeNames: [
              "MessageGroupId",
              "ApproximateReceiveCount",
            ],
          }),
        );

        messages = received.Messages ?? [];
      } catch (error: unknown) {
        if (!this.#running) {
          // Failed while stopping: nothing was received, nothing to hand back.
          return;
        }

        this.#options.emitError(toError(error));
        await this.#pause(RECEIVE_ERROR_BACKOFF_MS);

        continue;
      }

      if (!this.#running) {
        // Stopped during this receive: hand what it brought straight back
        // rather than leaving it in flight for a whole visibility timeout.
        await Promise.allSettled(
          messages.map((message) =>
            message.ReceiptHandle === undefined
              ? Promise.resolve()
              : this.#changeVisibility(message.ReceiptHandle, 0),
          ),
        );

        break;
      }

      for (const message of messages) {
        this.#dispatch(message);
      }
    }
  }

  /** Queues a message behind the others of its group. */
  #dispatch(message: Message): void {
    const { Body: body, ReceiptHandle: receiptHandle } = message;

    if (body === undefined || receiptHandle === undefined) {
      this.#options.emitError(
        new Error(
          `[${this.#options.connectorName}] Received a message with no body or receipt handle`,
        ),
      );

      return;
    }

    const groupKey =
      message.Attributes?.["MessageGroupId"] ??
      `message:${message.MessageId ?? randomUUID()}`;

    this.#groupFor(groupKey)
      .queue.push({
        message: { ...message, Body: body, ReceiptHandle: receiptHandle },
        deliveries: Number(
          message.Attributes?.["ApproximateReceiveCount"] ?? 1,
        ),
      })
      .catch((error: unknown) => this.#options.emitError(toError(error)))
      .finally(() => this.#wake());
  }

  #groupFor(groupKey: string): Group {
    const existing = this.#groups.get(groupKey);

    if (existing !== undefined) {
      return existing;
    }

    const group: Group = {
      queue: fastq.promise(
        (delivery: Delivery) => this.#run(group, delivery),
        1,
      ),
      blocked: false,
    };

    // No more work: forget the group, block included. That is safe because SQS
    // hands out none of a group's messages while any of them is in flight.
    group.queue.drain = () => {
      if (this.#groups.get(groupKey) === group) {
        this.#groups.delete(groupKey);
      }
    };

    this.#groups.set(groupKey, group);

    return group;
  }

  async #run(group: Group, delivery: Delivery): Promise<void> {
    const { message, deliveries } = delivery;
    const receiptHandle = message.ReceiptHandle;

    if (group.blocked) {
      // Behind a failed message of its group: it must not overtake it.
      await this.#changeVisibility(
        receiptHandle,
        this.#options.nackVisibilitySeconds,
      );

      return;
    }

    let outcome: Outcome = "pending";

    const received: ReceivedMessage = {
      content: message.Body,
      ack: async () => {
        outcome = "acked";
        await this.#delete(receiptHandle);
      },
      nack: async () => {
        outcome = "nacked";
        await this.#changeVisibility(
          receiptHandle,
          this.#options.nackVisibilitySeconds,
        );
      },
    };

    const { maxDeliveries, onDiscard } = this.#options;

    if (maxDeliveries !== undefined && deliveries > maxDeliveries) {
      try {
        onDiscard?.(received, deliveries);
      } catch (error: unknown) {
        this.#options.emitError(toError(error));
      }

      await received.ack();

      return;
    }

    try {
      await this.#options.handler(received);
    } catch (error: unknown) {
      this.#options.emitError(toError(error));

      if (outcome === "pending") {
        await received.nack();
      }
    }

    // `outcome` is reassigned inside the ack and nack callbacks, which control
    // flow analysis cannot see.
    if ((outcome as Outcome) === "nacked") {
      group.blocked = true;
    }
  }

  /** Messages held right now: waiting in a group queue, or being handled. */
  #inFlight(): number {
    let inFlight = 0;

    for (const group of this.#groups.values()) {
      inFlight += group.queue.length() + group.queue.running();
    }

    return inFlight;
  }

  /** Resolves once a slot is free, or the consumer stops. */
  async #freeSlot(): Promise<void> {
    while (this.#running && this.#inFlight() >= this.#options.maxInFlight) {
      await new Promise<void>((resolve) => {
        this.#wakePoll = resolve;
      });
    }
  }

  /** Waits `ms`, or less if the consumer stops. */
  async #pause(ms: number): Promise<void> {
    await new Promise<void>((resolve) => {
      const timer = setTimeout(done, ms);

      function done() {
        clearTimeout(timer);
        resolve();
      }

      this.#wakePoll = done;
    });

    this.#wakePoll = undefined;
  }

  #wake(): void {
    const wakePoll = this.#wakePoll;
    this.#wakePoll = undefined;
    wakePoll?.();
  }

  async #delete(receiptHandle: string): Promise<void> {
    try {
      await this.#options.client.send(
        new DeleteMessageCommand({
          QueueUrl: this.#options.queueUrl,
          ReceiptHandle: receiptHandle,
        }),
      );
    } catch (error: unknown) {
      this.#options.emitError(
        new Error(`[${this.#options.connectorName}] Failed to ack a message`, {
          cause: error,
        }),
      );
    }
  }

  async #changeVisibility(
    receiptHandle: string,
    visibilityTimeout: number,
  ): Promise<void> {
    try {
      await this.#options.client.send(
        new ChangeMessageVisibilityCommand({
          QueueUrl: this.#options.queueUrl,
          ReceiptHandle: receiptHandle,
          VisibilityTimeout: visibilityTimeout,
        }),
      );
    } catch (error: unknown) {
      this.#options.emitError(
        new Error(`[${this.#options.connectorName}] Failed to nack a message`, {
          cause: error,
        }),
      );
    }
  }
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
