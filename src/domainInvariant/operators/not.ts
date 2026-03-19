import { DomainInvariant, InvariantCheckResult } from "../interfaces";
import { ComposedDomainInvariant } from '../composedDomainInvariant';

export function not<State>(invariant: DomainInvariant<State>): DomainInvariant<State> {
  const composedComplyWith = (state: State): InvariantCheckResult => {
    const result = invariant.complyWith(state);

    return {
      operator: 'NOT',
      isCompliant: !result.isCompliant,
      description: `NOT (${result.description})`,
    }

  }

  return new ComposedDomainInvariant<State>(composedComplyWith);
}
