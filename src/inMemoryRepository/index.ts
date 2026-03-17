import { ok, Result, DomainEntity, IDomainEvent, Repository } from '../../src';

export class InMemoryRepository<State, Entity extends DomainEntity<State>> implements Repository<State, Entity> {
  #mapper: (id: string, state: State) => Entity;

  constructor(mapper: (id: string, state: State) => Entity) {
    this.#mapper = mapper
  }

  protected readonly store = new Map<string, State>();
  protected readonly eventStore = new Map<string, IDomainEvent[]>();

  async save(entity: Entity): Promise<Result<void, Error>> {
    this.store.set(entity.id(), entity.readState())
    return Promise.resolve(ok());
  }

  async saveWithEvents(entity: Entity, domainEvents: IDomainEvent | IDomainEvent[]): Promise<Result<void, Error>> {
    this.store.set(entity.id(), entity.readState());

    const events = this.eventStore.get(entity.id()) || [];

    events.push(...Array.isArray(domainEvents) ? domainEvents : [domainEvents]);

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

  list(params: { limit: number, offset: number }): Promise<Result<{ limit: number, offset: number, data: Entity[] }, Error>> {
    const entities: Entity[] = [];

    this.store.forEach((state, id) => {
      entities.push(this.#mapper(id, state));
    });

    const paginatedEntities = entities.slice(params.offset, params.offset + params.limit);

    return Promise.resolve(ok({
      limit: params.limit,
      offset: params.offset,
      data: paginatedEntities,
    }));
  }

  getEvents(id: string, options?: { limit: number, offset: number }): Promise<Result<IDomainEvent[], Error>> {
    const paginationOptions = options || { limit: 100, offset: 0 }

    const events = this.eventStore.get(id) || [];

    const paginatedEvents = events.slice(paginationOptions.offset, paginationOptions.offset + paginationOptions.limit);

    return Promise.resolve(ok(paginatedEvents));
  }
}

