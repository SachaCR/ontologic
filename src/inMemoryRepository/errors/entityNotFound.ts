import { CustomError } from '../../interfaces/customError';

export class EntityNotFound extends CustomError<'ENTITY_NOT_FOUND', { entityId: string }> {
  constructor(entityId: string) {
    super({
      message: 'Entity Not Found',
      errorCode: 'ENTITY_NOT_FOUND',
      name: 'DOMAIN_ERROR',
      context: {
        entityId,
      }
    })

    Object.setPrototypeOf(this, EntityNotFound.prototype);
  }
}
