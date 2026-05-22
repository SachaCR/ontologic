import { DomainEntity, DomainEventInterface } from "../../";

export interface UserState {
  id: string;
  name: string;
}

export class User extends DomainEntity<UserState> {
  constructor(id: string, version: number, state: UserState) {
    super(id, version, state);
  }

  static fromState(id: string, version: number, state: UserState): User {
    return new User(id, version, state);
  }
}

export function makeUser(id: string, name = "Alice", version = 1): User {
  return new User(id, version, { id, name });
}

export function makeEvent(
  entityId: string,
  name = "UserCreated",
): DomainEventInterface {
  return { name, version: 1, entityId, payload: {} };
}
