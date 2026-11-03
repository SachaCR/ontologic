import { EventEmitter } from "node:events";

import { DomainEntity } from "../domainEntity";
import { DomainEventInterface } from "../domainEvent";
import { DomainEventBusPublisher } from "../event-bus";
import { Repository } from "../repository";
import { type ErrorHandler } from "../messaging";
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
    // Only a lock this run took is this run's to release. When lock() refuses
    // because another run holds it, unlocking would free that other run's
    // lock, and a third run could then publish the same events concurrently.
    let locked = false;

    try {
      await this.stateRepository.lock({
        entityId,
        entityName: this.entityName,
      });

      locked = true;

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

        // Key delivery and the checkpoint by the AGGREGATE id (`entityId`, the stream this handler drains),
        // never the individual event's `entityId` — a sub-entity event (e.g. a node event on a workflow
        // aggregate) carries the sub-entity id, which would split the stream across FIFO groups and write
        // the checkpoint under a key that lock/getLastEventIdPublished never created.
        await this.publisher.publish(event, metadata, {
          orderingKey: entityId,
        });

        await this.stateRepository.updateLastEventIdPublished({
          eventId: metadata.id,
          entityId,
          entityName: this.entityName,
        });
      }
    } catch (err: unknown) {
      // Deliberately not the "error" channel: Node throws an "error" event that
      // has no listener, so a relay nobody called onError on would turn one
      // failed publish into a rejected handler() — and, behind onChanges, an
      // unhandled rejection that takes the process down.
      this.#eventEmitter.emit(
        "failure",
        err instanceof Error ? err : new Error(String(err)),
      );
    } finally {
      if (locked) {
        await this.stateRepository.unlock({
          entityId,
          entityName: this.entityName,
        });
      }
    }
  }

  /**
   * Told of every failure while relaying: reading the events, publishing them,
   * or moving the checkpoint. The run stops at the failed event, and the next
   * run for that entity starts again from the last checkpoint.
   *
   * Always receives an `Error`, like every other bus component.
   */
  onError(handler: ErrorHandler): void {
    this.#eventEmitter.on("failure", handler);
  }
}
