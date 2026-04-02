import { DomainInvariant } from "./domainInvariant/interfaces";

export interface IDomainEntity {
  id(): string;
  readState(): unknown;
  addInvariant(invariant: DomainInvariant<unknown>): void;
}

export class DomainEntity<State> implements IDomainEntity {
  #id: string;
  #invariants: DomainInvariant<State>[];
  protected state: State;

  constructor(id: string, state: State, invariants?: DomainInvariant<State>[]) {
    this.#id = id;
    this.state = structuredClone(state); // TODO: Verify it's JSON compatible ??
    this.#invariants = invariants || [];
    this.checkInvariants();
  }

  id(): string {
    return this.#id;
  }

  readState(): State {
    this.checkInvariants();
    return structuredClone(this.state);
  }

  addInvariant(invariant: DomainInvariant<State>) {
    this.#invariants.push(invariant);
  }

  private checkInvariants() {
    const isValid = this.#invariants.every(
      (invariant) => invariant.complyWith(this.state).isCompliant,
    );

    if (!isValid) {
      throw new Error("Corrupted state detected", {
        cause: this.state,
      });
    }
  }
}
