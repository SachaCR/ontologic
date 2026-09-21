import { EventEmitter } from "node:events";
import { type RedisClientType, createClient } from "redis";
import {
  type IOrderedListenerConnector,
  type BusConnectorStatus,
  type ReceivedMessage,
} from "ontologic";

import { redisSocketOptions } from "./socketOptions";

/**
 * Consumes commands from a Redis stream through a consumer group.
 *
 * A group, rather than a plain `XREAD`, is what makes `ack`/`nack` mean
 * something: an entry handed to a consumer sits in that group's pending list
 * until it is acked, so a process that dies mid-handling leaves the command
 * recoverable instead of losing it. Commands are not volatile the way responses
 * are — the caller is blocked waiting for an answer — so that guarantee is the
 * whole reason to prefer a stream over pub/sub here.
 *
 * ORDERING: a group spreads entries across its consumers, so append order only
 * survives to the handler while a single consumer reads the stream. Running two
 * of these against one group gives you throughput and loses per-key ordering.
 * Partitioning the stream by a hash of `orderingKey`, one consumer per
 * partition, is what buys ordering back under parallelism.
 */
export class RedisOrderedListener implements IOrderedListenerConnector {
  public readonly name: string = "Redis/OrderedListener";

  #eventEmitter: EventEmitter;
  #status: BusConnectorStatus;
  #topicName: string;
  #groupName: string;
  #consumerName: string;
  #blockMs: number;

  #subscriber: RedisClientType;
  #handler?: (message: ReceivedMessage) => Promise<void>;

  /** Resolves once the read loop has actually left its blocking read. */
  #consuming: Promise<void> | undefined;

  constructor(params: {
    topicName: string;
    redisUrl: string;
    groupName?: string;
    consumerName?: string;
    /** How long a single blocking read waits before looping. */
    blockMs?: number;
  }) {
    this.#eventEmitter = new EventEmitter({ captureRejections: true });
    this.#topicName = params.topicName;
    this.#groupName = params.groupName ?? `${params.topicName}-consumers`;
    this.#consumerName = params.consumerName ?? `consumer-${process.pid}`;
    this.#blockMs = params.blockMs ?? 1000;
    this.#subscriber = createClient({
      url: params.redisUrl,
      socket: redisSocketOptions(this.name),
    });
    this.#status = "STOPPED";
  }

  onMessage(handler: (message: ReceivedMessage) => Promise<void>) {
    this.#handler = handler;
  }

  topicName(): string {
    return this.#topicName;
  }

  get status(): BusConnectorStatus {
    return this.#status;
  }

  async checkConnection(): Promise<true> {
    try {
      const pingResult = await this.#subscriber.ping();

      const isHealthy = /.*pong.*/i.test(pingResult);

      if (!isHealthy) {
        throw new Error(`[${this.name}] Not healthy`, {
          cause: new Error(`Ping result: "${pingResult}"`),
        });
      }

      return true;
    } catch (error: unknown) {
      throw new Error(`[${this.name}] Failed to check connection`, {
        cause: error,
      });
    }
  }

  onError(handler: (error: Error) => void): void {
    this.#subscriber.on("error", (error) => {
      handler(error instanceof Error ? error : new Error(String(error)));
    });

    this.#eventEmitter.on("failure", (error) => {
      handler(error);
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
      await this.#subscriber.connect();
      await this.#createGroup();

      this.#status = "STARTED";

      // Not awaited: the loop runs for the lifetime of the connector. `stop()`
      // flips the status and waits on this handle.
      this.#consuming = this.#consume(handler);
    } catch (error: unknown) {
      throw new Error(
        `[${this.name}] Failed to start for topic "${this.#topicName}"`,
        { cause: error },
      );
    }
  }

  async stop(): Promise<void> {
    if (this.#status === "STOPPED") {
      return;
    }

    // Flip first so the loop sees it and exits after its current blocking read,
    // rather than issuing another one against a closing client.
    this.#status = "STOPPED";

    try {
      await this.#consuming;
      this.#consuming = undefined;

      await this.#subscriber.quit();
    } catch (error: unknown) {
      throw new Error(`[${this.name}] Failed to stop`, { cause: error });
    }
  }

  /**
   * Creates the group if it is not there yet, and the stream with it.
   *
   * `MKSTREAM` matters because a receiver usually starts before anything has
   * been published, and `XGROUP CREATE` on a missing stream is an error. A
   * group that already exists is the ordinary case on restart, so BUSYGROUP is
   * swallowed rather than treated as a failure.
   */
  async #createGroup(): Promise<void> {
    try {
      await this.#subscriber.xGroupCreate(
        this.#topicName,
        this.#groupName,
        "0",
        {
          MKSTREAM: true,
        },
      );
    } catch (error: unknown) {
      if (error instanceof Error && error.message.includes("BUSYGROUP")) {
        return;
      }

      throw error;
    }
  }

  /**
   * Reads and dispatches until `stop()` flips the status.
   *
   * It starts on id `"0"`, which replays this consumer's pending entries —
   * anything a previous run claimed but never acked, because it crashed partway
   * through. Once that backlog is drained it switches to `">"` for entries no
   * one has taken yet, and stays there.
   */
  async #consume(
    handler: (message: ReceivedMessage) => Promise<void>,
  ): Promise<void> {
    let cursor = "0";

    while (this.#status === "STARTED") {
      try {
        const replies = await this.#subscriber.xReadGroup(
          this.#groupName,
          this.#consumerName,
          { key: this.#topicName, id: cursor },
          { COUNT: 10, BLOCK: this.#blockMs },
        );

        const entries = replies?.[0]?.messages ?? [];

        if (cursor === "0" && entries.length === 0) {
          // The backlog is drained; from here on only fresh entries.
          cursor = ">";
          continue;
        }

        for (const entry of entries) {
          await this.#dispatch(handler, entry.id, entry.message);
        }
      } catch (error: unknown) {
        if (this.#status !== "STARTED") {
          // The client was closed under us by `stop()`. Expected, not a failure.
          return;
        }

        this.#eventEmitter.emit("failure", error);
      }
    }
  }

  async #dispatch(
    handler: (message: ReceivedMessage) => Promise<void>,
    entryId: string,
    fields: Record<string, string>,
  ): Promise<void> {
    const content = fields["message"];

    if (content === undefined) {
      // Not something a retry can fix, so take it out of the pending list
      // rather than leave it to be reclaimed forever.
      this.#eventEmitter.emit(
        "failure",
        new Error(
          `[${this.name}] Stream entry ${entryId} has no "message" field`,
        ),
      );

      await this.#ack(entryId);

      return;
    }

    try {
      await handler({
        content,
        ack: () => this.#ack(entryId),
        // A nack leaves the entry in the pending list, where `XAUTOCLAIM` or
        // another consumer can pick it up. Doing nothing is the whole point:
        // the entry is already claimed, and not acking is how it stays that way.
        nack: () => Promise.resolve(),
      });
    } catch (error: unknown) {
      this.#eventEmitter.emit("failure", error);
    }
  }

  async #ack(entryId: string): Promise<void> {
    try {
      await this.#subscriber.xAck(this.#topicName, this.#groupName, entryId);
    } catch (error: unknown) {
      this.#eventEmitter.emit(
        "failure",
        new Error(`[${this.name}] Failed to ack entry ${entryId}`, {
          cause: error,
        }),
      );
    }
  }
}
