import { DomainEntity } from '../../interfaces/domainEntity';
import { IDomainEvent } from '../../interfaces/domainEvent';

export interface UserState {
  id: string;
  name: string;
}

export class User extends DomainEntity<UserState> {
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

export function makeEvent(entityId: string, name = 'UserCreated'): IDomainEvent {
  return { name, version: 1, entityId, payload: {} };
}
