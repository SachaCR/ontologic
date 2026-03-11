import { BasicEntity } from '../../interfaces/entity';
import { DomainEvent } from '../../interfaces/domainEvent';

export interface UserState {
  id: string;
  name: string;
}

export class User extends BasicEntity<UserState> {
  constructor(id: string, state: UserState) {
    super(id, state);
  }

  static fromState(id: string, state: UserState): User {
    return new User(id, state);
  }
}

export function makeUser(id: string, name = 'Alice'): User {
  return new User(id, { id, name });
}

export function makeEvent(entityId: string, name = 'UserCreated'): DomainEvent {
  return { name, version: 1, entityId, payload: {} };
}
