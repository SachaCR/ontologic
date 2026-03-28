import { PublisherConnector } from "./connectors/publisher";
import { EventHandler, IDomainEventBusListener } from "./interfaces";
import { DomainEventInterface } from "../domainEvent";

export class DomainEventBusListener<Event extends DomainEventInterface>
  implements IDomainEventBusListener<Event>
{
  #listenerConnector: PublisherConnector;
  #eventHandlersMap: Map<Event["name"] | "*", EventHandler<Event>>;

  constructor(params: {
    publisherConnector: PublisherConnector;
    
  }) {
    const { publisherConnector } = params;

    if (!publisherConnector) {
      throw new Error(
        "[DomainEventBusListener] Must have a listener connector",
      );
    }

    this.#listenerConnector = publisherConnector;
    this.#eventHandlersMap = new Map<Event["name"] | "*", EventHandler<Event>>()
  }

  listenTo<EventName extends Event["name"]>(eventName:EventName | '*', handler: EventHandler<Extract<Event, { name: EventName }>>): void {
    this.#eventHandlersMap.set(eventName, handler as EventHandler<Event>);
  }

  async start() {
    // TODO: Attach the handler to the connector
 
    await this.#listenerConnector.start();
  }

  async stop() {
    await this.#listenerConnector.stop();
  }

  status() {
    return this.#listenerConnector.status;
  }

  onError(handler: (error: unknown) => void): void {
    this.#listenerConnector.onError(handler);
  }
}
