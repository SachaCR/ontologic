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

  /**
   * Returns the entity state without cloning. Invariants are still checked.
   *
   * Use this on hot paths where the clone cost of `readState()` shows up in
   * profiling. The returned value is typed `Readonly<State>` to signal that
   * mutation is a bug; that protection is shallow and erased at runtime, so
   * callers MUST NOT mutate the returned object or any of its nested objects.
   */
  unsafeReadState(): Readonly<State> {
    this.checkInvariants();
    return this.state;
  }

  /**
   * Returns the entity state with no defensive copy and no invariant check.
   *
   * The cheapest possible accessor. Bypasses every safety the entity offers.
   * Reserved for callers who can prove (by construction or by audit) that the
   * state is valid and will not be mutated. Mutating the returned object
   * silently corrupts the entity.
   */
  unsafeRawState(): State {
    return this.state;
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
