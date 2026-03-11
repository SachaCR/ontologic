import { ok, err, Result } from 'neverthrow';

import { BasicEntity } from "../interfaces/entity";
import { DomainEvent } from "../interfaces/domainEvent";
import { EntityNotFound } from './errors/entityNotFound';
import { Repository } from '../interfaces/repository';

export class InMemoryRepository<State, Entity extends BasicEntity<State>> implements Repository<State, Entity> {
  #mapper: (id: string, state: State) => Entity;

  constructor(mapper: (id: string, state: State) => Entity) {
    this.#mapper = mapper
  }

  private readonly store = new Map<string, State>();

  private readonly eventStore = new Map<string, DomainEvent[]>();

  async save(entity: BasicEntity<State>): Promise<Result<void, Error>> {
    this.store.set(entity.id(), entity.readState())
    return Promise.resolve(ok());
  }

  async saveWithEvents(entity: BasicEntity<State>, domainEvents: DomainEvent[]): Promise<Result<void, Error>> {
    this.store.set(entity.id(), entity.readState());

    const events = this.eventStore.get(entity.id()) || [];

    events.push(...domainEvents);

    this.eventStore.set(entity.id(), events);

    return Promise.resolve(ok());
  }

  getById(id: string): Promise<Result<Entity, EntityNotFound>> {
    const state = this.store.get(id);

    if (state === undefined) {
      return Promise.resolve(err(new EntityNotFound(id)));
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

  getEvents(id: string, options?: { limit: number, offset: number }): Promise<Result<DomainEvent[], Error>> {
    const paginationOptions = options || { limit: 100, offset: 0 }

    const events = this.eventStore.get(id) || [];

    const paginatedEvents = events.slice(paginationOptions.offset, paginationOptions.offset + paginationOptions.limit);

    return Promise.resolve(ok(paginatedEvents));
  }
}

