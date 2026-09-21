import { EventEmitter } from "node:events";
import { IDynamicPublisherConnector, IPublisherConnector } from "..";

export class InMemoryPublisherConnector
  implements IPublisherConnector, IDynamicPublisherConnector
{
  #status: "STARTED" | "STOPPED";
  #eventEmitter: EventEmitter;

  constructor(eventEmitter: EventEmitter) {
    this.#status = "STOPPED";
    this.#eventEmitter = eventEmitter;
  }

  publish(message: string): Promise<void> {
    this.#eventEmitter.emit("message", { content: message });
    return Promise.resolve();
  }

  publishTo(params: { topicName: string; message: string }): Promise<void> {
    this.#eventEmitter.emit(params.topicName, { content: params.message });
    return Promise.resolve();
  }

  get status(): "STARTED" | "STOPPED" {
    return this.#status;
  }

  start() {
    this.#status = "STARTED";
    return Promise.resolve();
  }

  stop() {
    this.#status = "STOPPED";
    return Promise.resolve();
  }

  onError(handler: (error: Error) => void): void {
    this.#eventEmitter.on("error", handler);
  }

  checkConnection(): Promise<boolean> {
    return Promise.resolve(true);
  }
}
