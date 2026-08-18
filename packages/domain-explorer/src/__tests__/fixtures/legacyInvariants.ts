import { BaseDomainInvariant, DomainEntity } from "ontologic";

/**
 * The pre-1.7 invariant form, kept as a fixture.
 *
 * The tool documents codebases it does not own, and one pinned to 1.6.x passes
 * invariants as a positional third constructor argument. Nothing in this
 * repository does that any more — library-example was upgraded when it joined
 * the workspace — so without this fixture that detection path would lose its
 * only coverage.
 *
 * This file is never compiled against the workspace `ontologic`; it is only
 * parsed.
 */
interface LegacyState {
  id: string;
  amount: number;
}

const amountIsPositive = new BaseDomainInvariant<LegacyState>(
  "Amount is positive",
  (state) => state.amount >= 0,
);

export class LegacyAggregate extends DomainEntity<LegacyState> {
  constructor(id: string, state: LegacyState) {
    // @ts-expect-error — the 1.6.x signature, deliberately preserved.
    super(id, state, [amountIsPositive]);
  }
}
