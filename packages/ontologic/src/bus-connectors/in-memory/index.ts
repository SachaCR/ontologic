import { EventEmitter } from "node:events";
import {
  InMemoryListenerConnector,
  InMemoryOrderedListenerConnector,
} from "./listener";
import {
  InMemoryDynamicPublisherConnector,
  InMemoryOrderedPublisherConnector,
  InMemoryPublisherConnector,
} from "./publisher";
import {
  CommandBusConnectors,
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
    this.orderedListener = new InMemoryOrderedListenerConnector(eventEmitter);

    this.publisher = new InMemoryPublisherConnector(eventEmitter);
    this.orderedPublisher = new InMemoryOrderedPublisherConnector(eventEmitter);

    this.dynamicPublisher = new InMemoryDynamicPublisherConnector(eventEmitter);
  }
}

export class InMemoryCommandBusConnectors implements CommandBusConnectors {
  responseListener: IListenerConnector;
  responseDynamicPublisher: IDynamicPublisherConnector;
  commandOrderedPublisher: IOrderedPublisherConnector;
  commandOrderedListener: IOrderedListenerConnector;

  constructor() {
    const eventEmitter: EventEmitter = new EventEmitter({
      captureRejections: true,
    });

    this.commandOrderedListener = new InMemoryOrderedListenerConnector(
      eventEmitter,
    );

    this.commandOrderedPublisher = new InMemoryOrderedPublisherConnector(
      eventEmitter,
    );

    this.responseDynamicPublisher = new InMemoryDynamicPublisherConnector(
      eventEmitter,
    );

    this.responseListener = new InMemoryListenerConnector(
      eventEmitter,
      "response-topic",
    );
  }
}
