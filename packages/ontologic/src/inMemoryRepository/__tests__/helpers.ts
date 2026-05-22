import { DomainEntity, DomainEventInterface } from "../../";

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

export function makeUser(id: string, name = "Alice"): User {
  return new User(id, { id, name });
}

export function makeEvent(
  entityId: string,
  name = "UserCreated",
): DomainEventInterface {
  return { name, version: 1, entityId, payload: {} };
}
