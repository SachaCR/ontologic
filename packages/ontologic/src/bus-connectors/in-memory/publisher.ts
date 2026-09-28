import { EventEmitter } from "node:events";
import {
  BusConnectorKind,
  IDynamicPublisherConnector,
  IOrderedPublisherConnector,
  IPublisherConnector,
} from "..";

/**
 * Everything an in-memory publisher does, including both `publish` and
 * `publishTo`. The three concrete classes below pick a `kind`; the extra
 * method each one carries is harmless, and sharing the implementation keeps
 * them behaving identically.
 */
abstract class InMemoryPublisherBase {
  abstract readonly kind: BusConnectorKind;

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

export class InMemoryPublisherConnector
  extends InMemoryPublisherBase
  implements IPublisherConnector
{
  public readonly kind = "publisher";
}

export class InMemoryOrderedPublisherConnector
  extends InMemoryPublisherBase
  implements IOrderedPublisherConnector
{
  public readonly kind = "ordered-publisher";
}

export class InMemoryDynamicPublisherConnector
  extends InMemoryPublisherBase
  implements IDynamicPublisherConnector
{
  public readonly kind = "dynamic-publisher";
}
