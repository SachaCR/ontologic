import { EventEmitter } from "node:events";
import { IListenerConnector, ReceivedMessage } from "../interfaces";

export class InMemoryListenerConnector implements IListenerConnector {
  #status: "STARTED" | "STOPPED";
  #eventEmitter: EventEmitter;
  #handler?: (message: ReceivedMessage) => Promise<void>;

  constructor(eventEmitter: EventEmitter) {
    this.#status = "STOPPED";
    this.#eventEmitter = eventEmitter;
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

    this.#eventEmitter.on(
      "message",
      async (message: { name: string; content: string }) => {
        await handler({
          content: message.content,
          name: message.name,
          ack: async () => {},
          nack: async () => {},
        });
      },
    );

    this.#status = "STARTED";

    return Promise.resolve();
  }

  stop() {
    this.#status = "STOPPED";
    this.#eventEmitter.removeAllListeners("message");
    return Promise.resolve();
  }

  onError(handler: (error: unknown) => void): void {
    this.#eventEmitter.on("error", handler);
  }
}
