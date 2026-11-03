import {
  type EventBusPublisherConnector,
  IDomainEventBusPublisher,
} from "./interfaces";
import { DomainEventInterface } from "../domainEvent";
import { validateMetadata } from "./validateMetadata";
import { type ErrorHandler } from "../messaging";

export class DomainEventBusPublisher<
  Event extends DomainEventInterface,
> implements IDomainEventBusPublisher<Event> {
  #publisherConnector: EventBusPublisherConnector;
  #validator?: (event: unknown) => Event;

  constructor(params: {
    publisherConnector: EventBusPublisherConnector;
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
    // Resolved first: a missing ordering key is a caller bug, reported before
    // anything else is checked.
    const send = this.#sender(options);

    const validatedMetadata = validateMetadata(metadata);

    let eventToPublish = event;

    if (this.#validator) {
      eventToPublish = this.#validator(event);
    }

    const message = {
      event: eventToPublish,
      metadata: validatedMetadata,
    };

    await send(JSON.stringify(message));
  }

  #sender(options?: {
    orderingKey?: string;
  }): (content: string) => Promise<void> {
    const connector = this.#publisherConnector;

    if (connector.kind === "ordered-publisher") {
      const orderingKey = options?.orderingKey;

      if (!orderingKey) {
        throw new Error(
          "[DomainEventBusPublisher] An ordered publisher connector needs an orderingKey",
        );
      }

      return (content) => connector.publish(content, { orderingKey });
    }

    return (content) => connector.publish(content, options);
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
