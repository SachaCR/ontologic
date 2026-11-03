import { IDomainEventBusPublisher } from "./interfaces";
import { DomainEventInterface } from "../domainEvent";
import { validateMetadata } from "./validateMetadata";
import { IPublisherConnector } from "../bus-connectors";
import { type ErrorHandler } from "../messaging";

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

    await this.#publisherConnector.publish(JSON.stringify(message), options);
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

  /**
   * Delegates to the connector.
   *
   * @throws if its connection check fails.
   */
  async checkConnection(): Promise<boolean> {
    return this.#publisherConnector.checkConnection();
  }

  onError(handler: ErrorHandler): void {
    this.#publisherConnector.onError(handler);
  }
}
