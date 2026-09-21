import { EventEmitter } from "node:events";
import { type RedisClientType, createClient } from "redis";
import {
  type IListenerConnector,
  type BusConnectorStatus,
  type ReceivedMessage,
} from "ontologic";

import { redisSocketOptions } from "./socketOptions";

export class RedisListener implements IListenerConnector {
  public readonly name: string = "Redis/Listener";
  #eventEmitter: EventEmitter;
  #status: BusConnectorStatus;
  #topicName: string;

  #subscriber: RedisClientType;
  #handler?: (message: ReceivedMessage) => Promise<void>;

  constructor(params: { topicName: string; redisUrl: string }) {
    this.#eventEmitter = new EventEmitter({ captureRejections: true });
    this.#topicName = params.topicName;
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
      await this.#subscriber.subscribe(
        this.#topicName,
        async (message: string) => {
          try {
            await handler({
              content: message,
              ack: () => {
                return Promise.resolve();
              },
              nack: () => {
                return Promise.resolve();
              },
            });
          } catch (error: unknown) {
            this.#eventEmitter.emit("failure", error);
          }
        },
      );

      this.#status = "STARTED";
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

    try {
      await this.#subscriber.quit();
      this.#status = "STOPPED";
    } catch (error: unknown) {
      throw new Error(`[${this.name}] Failed to stop`, { cause: error });
    }
  }
}
