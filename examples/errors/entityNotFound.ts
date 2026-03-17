import { DomainError } from '../../src/';

const NAME = 'ENTITY_NOT_FOUND';

export class EntityNotFound extends DomainError<typeof NAME, { entityId: string }> {
  name: typeof NAME;

  constructor(message: string, context: { entityId: string }) {
    super({
      message: message,
      name: NAME,
      context: context,
    })

    Object.setPrototypeOf(this, EntityNotFound.prototype);
  }
}
