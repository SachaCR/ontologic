import { DomainError } from "ontologic";

const NAME = "ENTITY_NOT_FOUND";

interface EntityNotFoundContext {
  entityId: string;
}

export class EntityNotFound extends DomainError<
  typeof NAME,
  EntityNotFoundContext
> {
  constructor(message: string, context: EntityNotFoundContext) {
    super({ message, name: NAME, context });

    Object.setPrototypeOf(this, EntityNotFound.prototype);
  }
}
