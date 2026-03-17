export interface IDomainEntity {
  id(): string;
  readState(): unknown;
}

export class DomainEntity<State> implements IDomainEntity {
  protected state: State;
  #id: string;

  constructor(id: string, state: State) {
    this.#id = id;
    this.state = structuredClone(state); // TODO: Verify it's JSON compatible ??
  }

  id(): string {
    return this.#id;
  }

  readState(): State {
    return structuredClone(this.state);
  }
}
