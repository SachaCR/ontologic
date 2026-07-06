import { CorruptedStateError } from "./corruptedStateError";
import { DomainInvariant } from "./domainInvariant/interfaces";

export interface IValueObject {
  readState(): unknown;
  addInvariant(invariant: DomainInvariant<unknown>): void;
}

export interface ValueObjectOptions<State, Serialized = State> {
  invariants?: DomainInvariant<State>[];
  /**
   * Produces the decoupled value returned by `readState()`.
   *
   * Defaults to `structuredClone`, which is correct when `State` is plain,
   * JSON-like data. Provide a custom implementation when the state holds live
   * class instances that `structuredClone` would strip of their prototypes —
   * return a plain, side-effect-free representation instead.
   *
   * This is NOT persistence. Its only job is to decouple the returned value
   * from the value object's internals so callers cannot mutate it through the
   * returned value. How that value is stored or transported stays the
   * persistence layer's concern. Note: when you specify a `Serialized` type
   * distinct from `State`, you MUST provide this function — the
   * `structuredClone` default cannot produce it.
   */
  serialize?: (state: State) => Serialized;
}

export class ValueObject<State, Serialized = State> implements IValueObject {
  #invariants: DomainInvariant<State>[];
  #serialize: (state: State) => Serialized;
  protected state: State;

  constructor(state: State, options?: ValueObjectOptions<State, Serialized>) {
    this.#invariants = options?.invariants ?? [];

    if (options?.serialize) {
      // A custom serialize implies the state may hold live instances. Take
      // ownership without cloning — a clone would strip their prototypes.
      // Callers must not keep mutating the object they pass in.
      this.#serialize = options.serialize;
      this.state = state;
    } else {
      // No custom serialize: the state is treated as plain, structuredClone-able
      // data throughout. Defensively clone on ingest so callers cannot mutate
      // the value object through the reference they passed in.
      this.#serialize = (state) => structuredClone(state) as unknown as Serialized;
      this.state = structuredClone(state);
    }

    this.checkInvariants();
  }

  readState(): Serialized {
    this.checkInvariants();
    return this.#serialize(this.state);
  }

  /**
   * Returns the value object state without serializing. Invariants are still checked.
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
   * Returns the value object state with no defensive copy and no invariant check.
   *
   * The cheapest possible accessor. Bypasses every safety the value object offers.
   * Reserved for callers who can prove (by construction or by audit) that the
   * state is valid and will not be mutated. Mutating the returned object
   * silently corrupts the value object.
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
        entityId: this.constructor.name,
        state: this.state,
        violations,
      });
    }
  }
}
