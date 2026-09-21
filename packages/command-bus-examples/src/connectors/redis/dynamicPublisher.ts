import { type RedisClientType, createClient } from "redis";

import { type IDynamicPublisherConnector, BusConnectorStatus } from "ontologic";

import { redisSocketOptions } from "./socketOptions";

export class RedisDynamicPublisher implements IDynamicPublisherConnector {
  public readonly name: string = "Redis/DynamicPublisher";

  #status: BusConnectorStatus;
  #publisher: RedisClientType;

  constructor(params: { redisUrl: string }) {
    this.#publisher = createClient({
      url: params.redisUrl,
      socket: redisSocketOptions(this.name),
    });
    this.#status = "STOPPED";
  }

  async publishTo(params: {
    topicName: string;
    message: string;
  }): Promise<void> {
    const { topicName, message } = params;

    await this.#publisher.publish(topicName, message);
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
