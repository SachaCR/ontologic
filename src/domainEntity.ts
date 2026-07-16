import { CorruptedStateError } from "./corruptedStateError";
import { DomainInvariant } from "./domainInvariant/interfaces";

export interface IDomainEntity {
  id(): string;
  version(): number;
  setVersion(version: number): void;
  readState(): unknown;
  addInvariant(invariant: DomainInvariant<unknown>): void;
}

export interface DomainEntityOptions<State, Serialized = State> {
  invariants?: DomainInvariant<State>[];
  /**
   * Produces the decoupled value returned by `readState()`.
   *
   * Defaults to `structuredClone`, which is correct when `State` is plain,
   * JSON-like data. Provide a custom implementation when the state holds live
   * class instances (e.g. the sub-entities of an aggregate) that
   * `structuredClone` would strip of their prototypes — return a plain,
   * side-effect-free representation instead.
   *
   * This is NOT persistence. Its only job is to decouple the returned value
   * from the entity's internals so callers cannot mutate the entity through it.
   * How that value is stored or transported stays the persistence layer's
   * concern. Note: when you specify a `Serialized` type distinct from `State`,
   * you MUST provide this function — the `structuredClone` default cannot
   * produce it.
   */
  serialize?: (state: State) => Serialized;
}

export class DomainEntity<State, Serialized = State> implements IDomainEntity {
  #id: string;
  #version = 0;
  #invariants: DomainInvariant<State>[];
  #serialize: (state: State) => Serialized;
  protected state: State;

  constructor(
    id: string,
    state: State,
    options?: DomainEntityOptions<State, Serialized>,
  ) {
    this.#id = id;
    this.#invariants = options?.invariants ?? [];

    if (options?.serialize) {
      // A custom serialize implies the state may hold live sub-entities. Take
      // ownership without cloning — a clone would strip their prototypes.
      // Callers must not keep mutating the object they pass in.
      this.#serialize = options.serialize;
      this.state = state;
    } else {
      // No custom serialize: the state is treated as plain, structuredClone-able
      // data throughout. Defensively clone on ingest so callers cannot mutate
      // the entity through the reference they passed in.
      this.#serialize = (state) => structuredClone(state) as unknown as Serialized;
      this.state = structuredClone(state);
    }

    this.checkInvariants();
  }

  id(): string {
    return this.#id;
  }

  /**
   * The optimistic-concurrency version the entity was loaded at — for event-sourced
   * aggregates, the sequence of its last persisted event (`0` when never persisted).
   * Repositories read this to guard the write against concurrent modifications.
   */
  version(): number {
    return this.#version;
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

  readState(): Serialized {
    this.checkInvariants();
    return this.#serialize(this.state);
  }

  /**
   * Returns the entity state without serializing. Invariants are still checked.
   *
   * Use this on hot paths where the cost of `readState()` shows up in
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
