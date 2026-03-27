import { ok, Result } from "../result";
import { DomainEntity } from "../domainEntity";
import { DomainEventInterface, EventWithMetadata } from "../domainEvent";
import { Repository } from "../repository";

export class InMemoryRepository<
  Entity extends DomainEntity<ReturnType<Entity["readState"]>>,
> implements Repository<Entity> {
  #mapper: (id: string, state: ReturnType<Entity["readState"]>) => Entity;

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

    const integrationEvents = domainEvents.map((event, index) => {
      return {
        event,
        metadata: {
          createdAt: new Date().toISOString(),
          offset: events.length + index,
        }
      }
    })

    events.push(
      ...integrationEvents
    );

    this.eventStore.set(entity.id(), events);

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
}
