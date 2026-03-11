import { Entity } from '../../interfaces/entity';
import { DomainEvent } from '../../interfaces/domainEvent';

export interface UserState {
  id: string;
  name: string;
}

export class User implements Entity<UserState> {
  private _state: UserState;

  constructor(state: UserState) {
    this._state = state;
  }

  id(): string {
    return this._state.id;
  }

  state(): UserState {
    return this._state;
  }
}

export function makeUser(id: string, name = 'Alice'): User {
  return new User({ id, name });
}

export function makeEvent(entityId: string, name = 'UserCreated'): DomainEvent {
  return { name, version: 1, entityId, payload: {} };
}
