import { DomainError } from "../../../../..";

const NAME = "ENTITY_NOT_FOUND";

export class EntityNotFound extends DomainError<
  typeof NAME,
  { entityId: string }
> {
  constructor(message: string, context: { entityId: string }) {
    super({
      message,
      name: NAME,
      context,
    });

    Object.setPrototypeOf(this, EntityNotFound.prototype);
  }
}
