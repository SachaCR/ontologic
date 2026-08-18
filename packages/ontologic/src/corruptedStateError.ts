export interface InvariantViolation {
  description: string;
}

/**
 * Thrown when a `DomainEntity` is found to violate one or more of its invariants.
 *
 * This is **not** a recoverable domain failure — it signals a programmer error.
 * The entity was constructed with valid state and a method mutated it into an
 * invalid state, or the state was hydrated from a source that did not respect
 * the entity's rules. Either way, the program cannot safely continue manipulating
 * the entity. Catch it at the application boundary, log every field, and fail
 * the current operation.
 *
 * Do not return it inside a `Result`. If you find yourself wanting to, the
 * underlying failure is probably a domain failure that deserves its own
 * `DomainError` subtype rather than an invariant violation.
 */
export class CorruptedStateError<State = unknown> extends Error {
  declare public name: "CORRUPTED_STATE";
  public readonly entityId: string;
  public readonly state: State;
  public readonly violations: InvariantViolation[];

  constructor(params: {
    entityId: string;
    state: State;
    violations: InvariantViolation[];
  }) {
    const { entityId, state, violations } = params;
    const summary = violations.map((v) => `"${v.description}"`).join(", ");

    super(
      `Corrupted state detected on entity "${entityId}". Failed invariants: ${summary}`,
      { cause: state },
    );

    this.name = "CORRUPTED_STATE";
    this.entityId = entityId;
    this.state = state;
    this.violations = violations;

    Object.setPrototypeOf(this, CorruptedStateError.prototype);
  }
}
