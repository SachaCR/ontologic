import { DomainInvariant, InvariantCheckResult } from "../interfaces";
import { ComposedDomainInvariant } from "../composedDomainInvariant";

export function and<State>(
  invariantA: DomainInvariant<State>,
  invariantB: DomainInvariant<State>,
): DomainInvariant<State> {
  const composedComplyWith = (state: State): InvariantCheckResult => {
    const AResult = invariantA.complyWith(state);
    const BResult = invariantB.complyWith(state);

    return {
      isCompliant: AResult.isCompliant && BResult.isCompliant,
      operator: "AND",
      description: `${AResult.description} AND (${BResult.description})`,
    };
  };

  return new ComposedDomainInvariant<State>(composedComplyWith);
}
