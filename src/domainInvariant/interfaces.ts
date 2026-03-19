export interface DomainInvariant<State> {
  complyWith(state: State): InvariantCheckResult
  and(invariant: DomainInvariant<State>): DomainInvariant<State>;
  or(invariant: DomainInvariant<State>): DomainInvariant<State>;
  not(): DomainInvariant<State>;
  xor(invariant: DomainInvariant<State>): DomainInvariant<State>;
  andNot(invariant: DomainInvariant<State>): DomainInvariant<State>;
}

export interface InvariantCheckResult {
  operator?: string;
  isCompliant: boolean;
  description: string;
}
