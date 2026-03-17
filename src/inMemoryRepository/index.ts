import { ok, Result, DomainEntity, DomainEventInterface, Repository } from "../../src";

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
  protected readonly eventStore = new Map<string, DomainEventInterface[]>();

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

    events.push(
      ...(Array.isArray(domainEvents) ? domainEvents : [domainEvents]),
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
  ): Promise<Result<DomainEventInterface[], Error>> {
    const paginationOptions = options || { limit: 100, offset: 0 };

    const events = this.eventStore.get(entityId) || [];

    const paginatedEvents = events.slice(
      paginationOptions.offset,
      paginationOptions.offset + paginationOptions.limit,
    );

    return Promise.resolve(ok(paginatedEvents));
  }
}
