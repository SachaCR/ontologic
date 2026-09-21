import { type RedisClientType, createClient } from "redis";

import { type IOrderedPublisherConnector, BusConnectorStatus } from "ontologic";

import { redisSocketOptions } from "./socketOptions";

export class RedisOrderedPublisher implements IOrderedPublisherConnector {
  public readonly name: string = "Redis/OrderedPublisher";

  #status: BusConnectorStatus;
  #topicName: string;
  #publisher: RedisClientType;

  constructor(params: { redisUrl: string; topicName: string }) {
    this.#topicName = params.topicName;
    this.#publisher = createClient({
      url: params.redisUrl,
      socket: redisSocketOptions(this.name),
    });

    this.#status = "STOPPED";
  }

  /**
   * Appends the command to the stream with `XADD`.
   *
   * `*` lets Redis assign the entry id, which is what makes the stream a log:
   * entries come back to a reader in the order they were appended.
   *
   * ORDERING CAVEAT: that order survives all the way to the handler only while
   * a single consumer reads the stream. A consumer group spreads entries across
   * its consumers, so two commands sharing an `orderingKey` can be handled out
   * of order — or concurrently — by two of them. Partitioning the stream by a
   * hash of the key, one consumer per partition, is what buys ordering back
   * under parallelism.
   *
   * The key travels as a field rather than being folded into the stream name so
   * that a reader can group on it without the publisher having to know how the
   * consuming side is partitioned.
   */
  async publish(
    message: string,
    options: { orderingKey: string },
  ): Promise<void> {
    try {
      await this.#publisher.xAdd(this.#topicName, "*", {
        orderingKey: options.orderingKey,
        message,
      });
    } catch (error: unknown) {
      throw new Error(
        `[${this.name}] Failed to publish to stream "${this.#topicName}"`,
        { cause: error },
      );
    }
  }

  topicName(): string {
    return this.#topicName;
  }

  get status() {
    return this.#status;
  }

  onError(handler: (error: Error) => void): void {
    this.#publisher.on("error", (error: Error) => {
      handler(error instanceof Error ? error : new Error(String(error)));
    });
  }

  async start(): Promise<void> {
    if (this.#status === "STARTED") {
      return;
    }

    try {
      await this.#publisher.connect();

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
      await this.#publisher.quit();
      this.#status = "STOPPED";
    } catch (error: unknown) {
      throw new Error(`[${this.name}] Failed to stop`, { cause: error });
    }
  }

  async checkConnection(): Promise<true> {
    try {
      const pingResult = await this.#publisher.ping();

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
}
