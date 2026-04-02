import { IPublisherConnector } from "./connectors/interfaces";
import { IDomainEventBusPublisher } from "./interfaces";
import { DomainEventInterface } from "../domainEvent";
import { validateMetadata } from "./validateMetadata";

export class DomainEventBusPublisher<
  Event extends DomainEventInterface,
> implements IDomainEventBusPublisher<Event> {
  #publisherConnector: IPublisherConnector;
  #validator?: (event: unknown) => Event;

  constructor(params: {
    publisherConnector: IPublisherConnector;
    options?: { validator?: (event: unknown) => Event };
  }) {
    const { publisherConnector, options } = params;

    if (!publisherConnector) {
      throw new Error(
        "[DomainEventBusPublisher] Must have a publisher connector",
      );
    }

    this.#publisherConnector = publisherConnector;

    if (options?.validator) {
      this.#validator = options.validator;
    }
  }

  async publish(
    event: Event,
    metadata: {
      id: string;
      offset?: number;
      createdAt: string;
    },
    options?: {
      orderingKey?: string;
    },
  ) {
    const validatedMetadata = validateMetadata(metadata);

    let eventToPublish = event;

    if (this.#validator) {
      eventToPublish = this.#validator(event);
    }

    const message = {
      event: eventToPublish,
      metadata: validatedMetadata,
    };

    await this.#publisherConnector.publish(
      event.name,
      JSON.stringify(message),
      options,
    );
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
