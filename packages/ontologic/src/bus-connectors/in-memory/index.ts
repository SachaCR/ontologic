import { EventEmitter } from "node:events";
import { InMemoryListenerConnector } from "./listener";
import { InMemoryPublisherConnector } from "./publisher";
import {
  IDynamicPublisherConnector,
  IListenerConnector,
  IOrderedListenerConnector,
  IOrderedPublisherConnector,
  IPublisherConnector,
} from "../interfaces";

export * from "./listener";
export * from "./publisher";

export class InMemoryConnectors {
  listener: IListenerConnector;
  publisher: IPublisherConnector;
  dynamicPublisher: IDynamicPublisherConnector;
  orderedPublisher: IOrderedPublisherConnector;
  orderedListener: IOrderedListenerConnector;

  constructor() {
    const eventEmitter: EventEmitter = new EventEmitter({
      captureRejections: true,
    });

    this.listener = new InMemoryListenerConnector(eventEmitter);
    this.orderedListener = new InMemoryListenerConnector(eventEmitter);

    this.publisher = new InMemoryPublisherConnector(eventEmitter);
    this.orderedPublisher = new InMemoryPublisherConnector(eventEmitter);

    this.dynamicPublisher = new InMemoryPublisherConnector(eventEmitter);
  }
}

export class InMemoryCommandBusConnectors {
  responseListener: IListenerConnector;
  responseDynamicPublisher: IDynamicPublisherConnector;
  commandOrderedPublisher: IOrderedPublisherConnector;
  commandOrderedListener: IOrderedListenerConnector;

  constructor() {
    const eventEmitter: EventEmitter = new EventEmitter({
      captureRejections: true,
    });

    this.commandOrderedListener = new InMemoryListenerConnector(eventEmitter);

    this.commandOrderedPublisher = new InMemoryPublisherConnector(eventEmitter);

    this.responseDynamicPublisher = new InMemoryPublisherConnector(
      eventEmitter,
    );

    this.responseListener = new InMemoryListenerConnector(
      eventEmitter,
      "response-topic",
    );
  }
}
