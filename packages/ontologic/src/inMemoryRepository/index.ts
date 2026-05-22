import { EventEmitter } from "node:events";
import { err, ok, Result } from "../result";
import { ConcurrentWriteError } from "../concurrentWriteError";
import { DomainEntity } from "../domainEntity";
import { DomainEventInterface } from "../domainEvent";
import { EventWithMetadata, Repository } from "../repository";
import { randomUUID } from "node:crypto";

export class InMemoryRepository<
  Entity extends DomainEntity<ReturnType<Entity["readState"]>>,
  Event extends DomainEventInterface,
> implements Repository<Entity, Event> {
  #mapper: (
    id: string,
    version: number,
    state: ReturnType<Entity["readState"]>,
  ) => Entity;
  #emitter = new EventEmitter({
    captureRejections: true,
  });

  constructor(
    mapper: (
      id: string,
      version: number,
      state: ReturnType<Entity["readState"]>,
    ) => Entity,
  ) {
    this.#mapper = mapper;
  }

  protected readonly store = new Map<
    string,
    { version: number; state: ReturnType<Entity["readState"]> }
  >();
  protected readonly eventStore = new Map<string, EventWithMetadata<Event>[]>();

  async save(entity: Entity): Promise<Result<void, ConcurrentWriteError>> {
    const existing = this.store.get(entity.id());

    if (existing) {
      // Creation attempted (v=0) but a row already exists — concurrent create.
      // Stale update — loaded version no longer matches what's stored.
      if (
        entity.version() === 0 ||
        existing.version !== entity.version()
      ) {
        return Promise.resolve(
          err(
            new ConcurrentWriteError({
              entityId: entity.id(),
              expectedVersion: entity.version(),
            }),
          ),
        );
      }
    }

    // Fresh creation lands at v=1 so subsequent saves take the UPDATE path.
    const newVersion =
      entity.version() === 0
        ? 1
        : existing
          ? existing.version + 1
          : entity.version();

    this.store.set(entity.id(), {
      state: entity.readState(),
      version: newVersion,
    });

    entity.setVersion(newVersion);

    return Promise.resolve(ok());
  }

  async saveWithEvents(
    entity: Entity,
    domainEvents: Event | Event[],
  ): Promise<Result<void, ConcurrentWriteError>> {
    const existing = this.store.get(entity.id());

    if (existing) {
      if (
        entity.version() === 0 ||
        existing.version !== entity.version()
      ) {
        return Promise.resolve(
          err(
            new ConcurrentWriteError({
              entityId: entity.id(),
              expectedVersion: entity.version(),
            }),
          ),
        );
      }
    }

    const newVersion =
      entity.version() === 0
        ? 1
        : existing
          ? existing.version + 1
          : entity.version();

    this.store.set(entity.id(), {
      state: entity.readState(),
      version: newVersion,
    });

    entity.setVersion(newVersion);

    const events = this.eventStore.get(entity.id()) || [];

    if (!Array.isArray(domainEvents)) {
      domainEvents = [domainEvents];
    }

    const eventsWithMetadata = domainEvents.map((event, index) => {
      return {
        event,
        metadata: {
          id: randomUUID() as string,
          createdAt: new Date().toISOString(),
          offset: events.length + index,
        },
      };
    });

    events.push(...eventsWithMetadata);

    this.eventStore.set(entity.id(), events);

    this.#emitter.emit("domainEventsSaved", entity.id());

    return Promise.resolve(ok());
  }

  getById(id: string): Promise<Result<Entity | undefined, Error>> {
    const snapshot = this.store.get(id);

    if (snapshot === undefined) {
      return Promise.resolve(ok(undefined));
    }

    return Promise.resolve(
      ok(this.#mapper(id, snapshot.version, snapshot.state)),
    );
  }

  list(params: {
    limit: number;
    offset: number;
  }): Promise<
    Result<{ limit: number; offset: number; data: Entity[] }, Error>
  > {
    const entities: Entity[] = [];

    this.store.forEach((snapshot, id) => {
      entities.push(this.#mapper(id, snapshot.version, snapshot.state));
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
  ): Promise<Result<EventWithMetadata<Event>[], Error>> {
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
    eventId: string | undefined,
    limit: number = 50,
  ): Promise<Result<EventWithMetadata<Event>[], Error>> {
    const events = this.eventStore.get(entityId) || [];

    let foundPrecedingEventIndex = events.findIndex(
      (event) => event.metadata.id === eventId,
    );

    if (foundPrecedingEventIndex === -1) {
      foundPrecedingEventIndex = 0;
    }

    const paginatedEvents = events.slice(
      foundPrecedingEventIndex,
      foundPrecedingEventIndex + limit,
    );

    return Promise.resolve(ok(paginatedEvents));
  }

  onChanges(handler: (entityId: string) => void): void {
    this.#emitter.on("domainEventsSaved", handler);
  }
}
