import { Result } from 'neverthrow';

import { DomainEntity } from "./entity.ts";
import { IDomainEvent } from "./domainEvent";

export interface Repository<State, Entity extends DomainEntity<State>> {
  save(entity: Entity): Promise<Result<void, Error>>;

  saveWithEvents(entity: Entity, domainEvents: IDomainEvent[]): Promise<Result<void, Error>>;

  getById(id: string): Promise<Result<Entity | undefined, Error>>;

  list(params: { limit: number, offset: number }): Promise<Result<{ limit: number, offset: number, data: Entity[] }, Error>>;

  getEvents(id: string, options?: { limit: number, offset: number }): Promise<Result<IDomainEvent[], Error>>;
}

