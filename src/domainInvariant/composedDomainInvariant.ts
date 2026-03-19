
import { DomainInvariant, InvariantCheckResult } from "./interfaces";
import { and } from './operators/and';
import { or } from './operators/or';
import { not } from './operators/not';
import { xor } from './operators/xor';
import { andNot } from './operators/andNot';

export class ComposedDomainInvariant<State> implements DomainInvariant<State> {
  #validator: (state: State) => InvariantCheckResult ;
 
  constructor(complyWith: (state: State) => InvariantCheckResult) {
    this.#validator = complyWith;
  }

  complyWith(state: State): InvariantCheckResult {
    return this.#validator(state);
  }

  and(invariant: DomainInvariant<State>): DomainInvariant<State> {
    return and(this, invariant);
  }

  or(invariant: DomainInvariant<State>): DomainInvariant<State> {
    return or(this, invariant);
  }

  not(): DomainInvariant<State> {
    return not(this);
  }

  xor(invariant: DomainInvariant<State>): DomainInvariant<State> {
    return xor(this, invariant);
  }

  andNot(invariant: DomainInvariant<State>): DomainInvariant<State> {
    return andNot(this, invariant);
  }
}
