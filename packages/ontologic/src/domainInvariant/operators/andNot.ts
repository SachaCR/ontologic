import { DomainInvariant, InvariantCheckResult } from "../interfaces";
import { ComposedDomainInvariant } from "../composedDomainInvariant";

export function andNot<State>(
  invariantA: DomainInvariant<State>,
  invariantB: DomainInvariant<State>,
): DomainInvariant<State> {
  const composedComplyWith = (state: State): InvariantCheckResult => {
    const AResult = invariantA.complyWith(state);
    const BResult = invariantB.complyWith(state);

    return {
      isCompliant: AResult.isCompliant && !BResult.isCompliant,
      operator: "AND NOT",
      description: `${AResult.description} AND NOT (${BResult.description})`,
    };
  };

  return new ComposedDomainInvariant<State>(composedComplyWith);
}
