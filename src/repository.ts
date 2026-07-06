import { Result } from "./result/index";

import { DomainEntity } from "./domainEntity";
import { DomainEventInterface } from "./domainEvent";

export interface EventWithMetadata<Event extends DomainEventInterface> {
  event: Event;
  metadata: EventMetadata;
}

export interface EventMetadata {
  id: string;
  offset?: number;
  createdAt: string;
}
export interface Repository<
  Entity extends DomainEntity<any, ReturnType<Entity["readState"]>>,
  Event extends DomainEventInterface,
> {
  save(entity: Entity): Promise<Result<void, Error>>;

  saveWithEvents(
    entity: Entity,
    domainEvents: DomainEventInterface | DomainEventInterface[],
  ): Promise<Result<void, Error>>;

  getById(id: string): Promise<Result<Entity | undefined, Error>>;

  list(params: {
    limit: number;
    offset: number;
  }): Promise<Result<{ limit: number; offset: number; data: Entity[] }, Error>>;

  getEvents(
    entityId: string,
    options?: { limit: number; offset: number },
  ): Promise<Result<EventWithMetadata<Event>[], Error>>;

  getEventsAfter(
    entityId: string,
    eventId: string | undefined,
    limit?: number,
  ): Promise<Result<EventWithMetadata<Event>[], Error>>;

  onChanges(handler: (entityId: string) => void): void;
}
