import { EventEmitter } from "node:events";

import { DomainEntity } from "../domainEntity";
import { DomainEventInterface } from "../domainEvent";
import { DomainEventBusPublisher } from "../event-bus";
import { Repository } from "../repository";
import { MessageRelayStateRepository } from "./interfaces";

export * from "./repository/inMemory";
export * from "./interfaces";

export class MessageRelay {
  #eventEmitter: EventEmitter;

  constructor(
    private readonly repository: Repository<
      DomainEntity<unknown>,
      DomainEventInterface
    >,
    private readonly stateRepository: MessageRelayStateRepository,
    private readonly entityName: string,
    private readonly publisher: DomainEventBusPublisher<DomainEventInterface>,
  ) {
    this.#eventEmitter = new EventEmitter({
      captureRejections: true,
    });
  }

  async handler(entityId: string) {
    try {
      await this.stateRepository.lock({
        entityId,
        entityName: this.entityName,
      });

      const lastEventIdPublished =
        await this.stateRepository.getLastEventIdPublished({
          entityId,
          entityName: this.entityName,
        });

      const result = await this.repository.getEventsAfter(
        entityId,
        lastEventIdPublished,
      );

      if (result.isErr()) {
        throw result.error;
      }

      const eventsToPublish = result.value;

      for (let i = 0; i < eventsToPublish.length; i++) {
        const eventToPublish = eventsToPublish[i];

        if (!eventToPublish) {
          return;
        }

        const { event, metadata } = eventToPublish;

        await this.publisher.publish(event, metadata);

        await this.stateRepository.updateLastEventIdPublished({
          eventId: metadata.id,
          entityId: event.entityId,
          entityName: this.entityName,
        });
      }
    } catch (err: unknown) {
      this.#eventEmitter.emit("error", err);
    } finally {
      await this.stateRepository.unlock({
        entityId,
        entityName: this.entityName,
      });
    }
  }

  onError(handler: (err: unknown) => void) {
    this.#eventEmitter.on("error", handler);
  }
}
