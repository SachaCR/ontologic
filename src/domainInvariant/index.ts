import {InvariantCheckResult, DomainInvariant} from './interfaces';

import {and} from './operators/and';
import {or} from './operators/or';
import {not} from './operators/not';
import {xor} from './operators/xor';
import {andNot} from './operators/andNot';

export class BaseDomainInvariant<State> implements DomainInvariant<State>{
  #validator: (state: State) => InvariantCheckResult ;
  
  constructor(description: string, complyWith: (state: State) => boolean) {
    this.#validator = (state: State) => {

      const isCompliant = complyWith(state);

      return {
        isCompliant,
        description,
      };
    };
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

