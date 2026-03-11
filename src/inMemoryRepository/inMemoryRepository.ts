import { ok, err, Result } from 'neverthrow';

import { Entity } from "../interfaces/entity";
import { DomainEvent } from "../interfaces/domainEvent";
import { Repository } from '../interfaces/repository';
import { EntityNotFound } from './errors/entityNotFound';

export class InMemoryRepository<T extends Entity<object>>
  implements Repository<T> {

  private readonly store = new Map<string, T>();

  private readonly eventStore = new Map<string, DomainEvent[]>();

  async save(entity: T): Promise<Result<void, Error>> {
    this.store.set(entity.id(), entity)
    return Promise.resolve(ok());
  }

  async saveWithEvents(entity: T, domainEvents: DomainEvent[]): Promise<Result<void, Error>> {
    this.store.set(entity.id(), entity)
    const events = this.eventStore.get(entity.id()) || [];

    events.push(...domainEvents);

    this.eventStore.set(entity.id(), events);

    return Promise.resolve(ok());
  }

  getById(id: string): Promise<Result<T, EntityNotFound>> {
    const entity = this.store.get(id);

    if (entity === undefined) {
      return Promise.resolve(err(new EntityNotFound(id)));
    }

    return Promise.resolve(ok(entity));
  }

  list(params: { limit: number, offset: number }): Promise<Result<{ limit: number, offset: number, data: T[] }, Error>> {
    const entities = Array.from(this.store.values());

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
