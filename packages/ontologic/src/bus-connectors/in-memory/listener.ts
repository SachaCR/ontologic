import { EventEmitter } from "node:events";
import {
  BusConnectorKind,
  IListenerConnector,
  IOrderedListenerConnector,
  ReceivedMessage,
} from "..";

/**
 * Everything an in-memory listener does. The two concrete classes below add
 * nothing but their `kind`, which is what keeps a plain listener from being
 * accepted where an ordered one is required.
 */
abstract class InMemoryListenerBase {
  abstract readonly kind: BusConnectorKind;

  #status: "STARTED" | "STOPPED";
  #eventEmitter: EventEmitter;
  #handler?: (message: ReceivedMessage) => Promise<void>;
  #topic: string;

  constructor(eventEmitter: EventEmitter, topic?: string) {
    this.#status = "STOPPED";
    this.#eventEmitter = eventEmitter;
    this.#topic = topic || "message";
  }

  topicName(): string {
    return this.#topic;
  }

  onMessage(handler: (message: ReceivedMessage) => Promise<void>) {
    this.#handler = handler;
  }

  get status(): "STARTED" | "STOPPED" {
    return this.#status;
  }

  start() {
    if (this.#status === "STARTED") {
      return Promise.resolve();
    }

    if (!this.#handler) {
      throw new Error(
        "[InMemoryListenerConnector]: Cannot start if no handler has been registered. Use onMessage() before start()",
      );
    }

    const handler = this.#handler;

    this.#eventEmitter.on(this.#topic, async (message: { content: string }) => {
      await handler({
        content: message.content,
        ack: async () => {},
        nack: async () => {},
      });
    });

    this.#status = "STARTED";

    return Promise.resolve();
  }

  stop() {
    this.#status = "STOPPED";
    this.#eventEmitter.removeAllListeners(this.#topic);
    return Promise.resolve();
  }

  onError(handler: (error: Error) => void): void {
    this.#eventEmitter.on("error", handler);
  }

  checkConnection(): Promise<boolean> {
    return Promise.resolve(true);
  }
}

export class InMemoryListenerConnector
  extends InMemoryListenerBase
  implements IListenerConnector
{
  public readonly kind = "listener";
}

export class InMemoryOrderedListenerConnector
  extends InMemoryListenerBase
  implements IOrderedListenerConnector
{
  public readonly kind = "ordered-listener";
}
