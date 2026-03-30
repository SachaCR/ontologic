import { IPublisherConnector } from "./connectors/interfaces";
import { IDomainEventBusPublisher } from "./interfaces";
import { DomainEventInterface } from "../domainEvent";
import { EventMetadata } from "../repository";

export class DomainEventBusPublisher<Event extends DomainEventInterface>
  implements IDomainEventBusPublisher<Event>
{
  #publisherConnector: IPublisherConnector;

  constructor(params: {
    publisherConnector: IPublisherConnector;
  }) {
    const { publisherConnector } = params;

    if (!publisherConnector) {
      throw new Error(
        "[DomainEventBusPublisher] Must have a publisher connector",
      );
    }

    this.#publisherConnector = publisherConnector;
  }

  async publish(event: Extract<Event, { name: Event["name"] }>, metadata: EventMetadata) {

    // TODO: Validate metadata

    // TODO: Validate event

    const message = {
      event,
      metadata
    }

    this.#publisherConnector.publish(event.name, JSON.stringify(message));
  }

  async start() {
    await this.#publisherConnector.start();
  }

  async stop() {
    await this.#publisherConnector.stop();
  }

  status() {
    return this.#publisherConnector.status;
  }

  onError(handler: (error: unknown) => void): void {
    this.#publisherConnector.onError(handler);
  }
}
