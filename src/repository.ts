import { Result } from "./result/index";

import { DomainEntity } from "./domainEntity";
import { DomainEventInterface } from "./domainEvent";

export interface Repository<
  Entity extends DomainEntity<ReturnType<Entity["readState"]>>,
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
  ): Promise<Result<DomainEventInterface[], Error>>;
}
