import { CorruptedStateError } from "./corruptedStateError";
import { DomainInvariant } from "./domainInvariant/interfaces";

export interface IDomainEntity {
  id(): string;
  version(): number;
  setVersion(version: number): void;
  readState(): unknown;
  addInvariant(invariant: DomainInvariant<unknown>): void;
}

export class DomainEntity<State> implements IDomainEntity {
  #id: string;
  #version: number;
  #invariants: DomainInvariant<State>[];
  protected state: State;

  constructor(
    id: string,
    version: number,
    state: State,
    invariants?: DomainInvariant<State>[],
  ) {
    this.#id = id;
    this.#version = version;
    this.state = structuredClone(state); // TODO: Verify it's JSON compatible ??
    this.#invariants = invariants || [];
    this.checkInvariants();
  }

  id(): string {
    return this.#id;
  }

  version(): number {
    return this.#version;
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

  /**
   * Updates the entity's in-memory version. Repositories call this after a
   * successful save so subsequent saves of the same instance see the
   * up-to-date version and don't trip the optimistic-concurrency check.
   *
   * Domain code should not call this directly — mutating the version outside
   * of a persistence boundary defeats the purpose of optimistic locking.
   */
  setVersion(version: number): void {
    this.#version = version;
  }

  addInvariant(invariant: DomainInvariant<State>) {
    this.#invariants.push(invariant);
  }

  private checkInvariants() {
    const violations = this.#invariants
      .map((invariant) => invariant.complyWith(this.state))
      .filter((result) => !result.isCompliant)
      .map(({ description }) => ({ description }));

    if (violations.length > 0) {
      throw new CorruptedStateError({
        entityId: this.#id,
        state: this.state,
        violations,
      });
    }
  }
}
