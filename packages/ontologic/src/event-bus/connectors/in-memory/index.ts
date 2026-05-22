import { EventEmitter } from "node:events";
import { InMemoryListenerConnector } from "./listener";
import { InMemoryPublisherConnector } from "./publisher";
import { IListenerConnector, IPublisherConnector } from "../interfaces";

export * from "./listener";
export * from "./publisher";

export class InMemoryConnectors {
  listener: IListenerConnector;
  publisher: IPublisherConnector;

  constructor() {
    const eventEmitter: EventEmitter = new EventEmitter({
      captureRejections: true,
    });
    this.listener = new InMemoryListenerConnector(eventEmitter);
    this.publisher = new InMemoryPublisherConnector(eventEmitter);
  }
}
