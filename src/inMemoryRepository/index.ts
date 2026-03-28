import { EventEmitter } from "node:events";
import { ok, Result } from "../result";
import { DomainEntity } from "../domainEntity";
import { DomainEventInterface } from "../domainEvent";
import { EventWithMetadata, Repository } from "../repository";
import { randomUUID } from "node:crypto";

export class InMemoryRepository<
  Entity extends DomainEntity<ReturnType<Entity["readState"]>>,
> implements Repository<Entity> {
  #mapper: (id: string, state: ReturnType<Entity["readState"]>) => Entity;
  #emitter = new EventEmitter({
    captureRejections: true
  });

  constructor(
    mapper: (id: string, state: ReturnType<Entity["readState"]>) => Entity,
  ) {
    this.#mapper = mapper;
  }

  protected readonly store = new Map<string, ReturnType<Entity["readState"]>>();
  protected readonly eventStore = new Map<string, EventWithMetadata[]>();

  async save(entity: Entity): Promise<Result<void, Error>> {
    this.store.set(entity.id(), entity.readState());
    return Promise.resolve(ok());
  }

  async saveWithEvents(
    entity: Entity,
    domainEvents: DomainEventInterface | DomainEventInterface[],
  ): Promise<Result<void, Error>> {
    this.store.set(entity.id(), entity.readState());

    const events = this.eventStore.get(entity.id()) || [];

    if(!Array.isArray(domainEvents)) {
      domainEvents =[domainEvents] 
    }

    const eventsWithMetadata = domainEvents.map((event, index) => {
      return {
        event,
        metadata: {
          id: randomUUID(),
          createdAt: new Date().toISOString(),
          offset: events.length + index,
        }
      }
    })

    events.push(
      ...eventsWithMetadata
    );

    this.eventStore.set(entity.id(), events);

    this.#emitter.emit("domainEventsSaved", entity.id());

    return Promise.resolve(ok());
  }

  getById(id: string): Promise<Result<Entity | undefined, Error>> {
    const state = this.store.get(id);

    if (state === undefined) {
      return Promise.resolve(ok(undefined));
    }

    return Promise.resolve(ok(this.#mapper(id, state)));
  }

  list(params: {
    limit: number;
    offset: number;
  }): Promise<
    Result<{ limit: number; offset: number; data: Entity[] }, Error>
  > {
    const entities: Entity[] = [];

    this.store.forEach((state, id) => {
      entities.push(this.#mapper(id, state));
    });

    const paginatedEntities = entities.slice(
      params.offset,
      params.offset + params.limit,
    );

    return Promise.resolve(
      ok({
        limit: params.limit,
        offset: params.offset,
        data: paginatedEntities,
      }),
    );
  }

  getEvents(
    entityId: string,
    options?: { limit: number; offset: number },
  ): Promise<Result<EventWithMetadata[], Error>> {
    const paginationOptions = options || { limit: 100, offset: 0 };

    const events = this.eventStore.get(entityId) || [];

    const paginatedEvents = events.slice(
      paginationOptions.offset,
      paginationOptions.offset + paginationOptions.limit,
    );

    return Promise.resolve(ok(paginatedEvents));
  }

  getEventsAfter(
    entityId: string,
    eventId: string,
    limit: number = 50
  ): Promise<Result<EventWithMetadata[], Error>> {

    const events = this.eventStore.get(entityId) || [];

    const foundPrecedingEventIndex = events.findIndex(event => event.metadata.id === eventId)

    if(foundPrecedingEventIndex === -1) { 
      throw new Error("Unknown event id");
    }

    const paginatedEvents = events.slice(
      foundPrecedingEventIndex,
      foundPrecedingEventIndex + limit,
    );

    return Promise.resolve(ok(paginatedEvents));
  }
  on(handler: (entityId: string) => void): void {
    this.#emitter.on("domainEventsSaved", handler);
  }
}
