import { Result } from 'neverthrow';

import {
  Entity
} from "./entity.ts";
import { DomainEvent } from "./domainEvent";
import { EntityNotFound } from '../inMemoryRepository/errors/entityNotFound';

export interface Repository<T extends Entity<object>> {
  save(entity: T): Promise<Result<void, Error>>;
  saveWithEvents(entity: T, domainEvents: DomainEvent[]): Promise<Result<void, Error>>;
  getById(id: string): Promise<Result<T, EntityNotFound>>;
  list(params: { limit: number, offset: number }): Promise<Result<{ limit: number, offset: number, data: T[] }, Error>>;
  getEvents(id: string, options?: { limit: number, offset: number }): Promise<Result<DomainEvent[], Error>>;
}
