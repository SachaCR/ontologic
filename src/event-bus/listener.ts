import {ListenerConnector} from "./connectors/interfaces";
import { EventHandler, IDomainEventBusListener } from "./interfaces";
import { DomainEventInterface } from "../domainEvent";

export class DomainEventBusListener<Event extends DomainEventInterface>
  implements IDomainEventBusListener<Event>
{
  #listenerConnector: ListenerConnector
  #eventHandlersMap: Map<Event["name"] | "*", EventHandler<Event>>;

  constructor(params: {
    listenerConnector: ListenerConnector;
  }) {
    const { listenerConnector  } = params;

    if (!listenerConnector) {
      throw new Error(
        "[DomainEventBusListener] Must have a listener connector",
      );
    }

    this.#listenerConnector = listenerConnector;
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
