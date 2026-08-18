import type { UnmarkedUseCase } from "./useCases";
import type {
  DomainNode,
  EntityNode,
  ErrorNode,
  EventNode,
  EventUnion,
  Finding,
  InvariantNode,
  UseCaseNode,
} from "./model";

/**
 * Self-contradictions in the analysed codebase.
 *
 * These fall out of the graph the extractor has already built, and each one is
 * a defect observed in a real corpus rather than a hypothetical.
 */
export function computeFindings(
  nodes: DomainNode[],
  eventUnions: EventUnion[],
  unmarkedUseCases: UnmarkedUseCase[] = [],
): Finding[] {
  return [
    ...eventsMissingFromUnions(nodes, eventUnions),
    ...errorsMissingSetPrototype(nodes),
    ...legacyInvariantAttachment(nodes),
    ...invariantsNeverAttached(nodes),
    ...useCasesWithErasedErrorUnion(nodes),
    ...useCasesNotMarked(unmarkedUseCases),
  ];
}

/**
 * A function that reads and writes aggregates the way a use case does, but does
 * not declare `implements UseCase<…>`.
 *
 * Without this the report would simply not list it, which reads as "this
 * codebase has no use cases" rather than "these use cases are invisible to the
 * type system". The marker is what makes the action — and therefore whether the
 * operation is a command or a query — knowable.
 */
function useCasesNotMarked(unmarked: UnmarkedUseCase[]): Finding[] {
  return unmarked.map((candidate) => ({
    code: "use-case-not-marked" as const,
    message:
      `${candidate.name} reads and writes aggregates like a use case but does ` +
      `not implement UseCase<Action, Output, Errors>, so its action — and ` +
      `whether it is a command or a query — cannot be determined.`,
    nodeId: `useCase:${candidate.location.file}#${candidate.name}`,
    location: candidate.location,
  }));
}

/**
 * An invariant is declared but no entity attaches it, so the rule it encodes is
 * never enforced. A declared-but-unused invariant looks like protection and
 * provides none.
 */
function invariantsNeverAttached(nodes: DomainNode[]): Finding[] {
  const attached = new Set(
    nodes
      .filter(
        (n): n is EntityNode => n.kind === "entity" || n.kind === "valueObject",
      )
      .flatMap((entity) => entity.invariants),
  );

  return nodes
    .filter((n): n is InvariantNode => n.kind === "invariant")
    .filter((invariant) => !attached.has(invariant.id))
    .map((invariant) => ({
      code: "invariant-never-attached" as const,
      message:
        `${invariant.name} ("${invariant.description}") is declared but never ` +
        `attached to an entity, so the rule is never enforced.`,
      nodeId: invariant.id,
      location: invariant.location,
    }));
}

/**
 * A use case whose error side is `Result<_, Error>` rather than a union of the
 * failures it can actually produce. Callers cannot switch exhaustively on it,
 * so `switchGuard` stops protecting them and a new failure mode added later
 * goes unnoticed.
 */
function useCasesWithErasedErrorUnion(nodes: DomainNode[]): Finding[] {
  return nodes
    .filter((n): n is UseCaseNode => n.kind === "useCase")
    .filter((useCase) => useCase.errorUnionErased)
    .map((useCase) => ({
      code: "use-case-error-union-erased" as const,
      message:
        `${useCase.name} declares Result<_, Error>, so callers cannot handle ` +
        `its failures exhaustively. List the domain errors it can return.`,
      nodeId: useCase.id,
      location: useCase.location,
    }));
}

/**
 * An event class exists and is emitted, but the aggregate's union type does not
 * list it. The union is what types the repository and the bus listener, so an
 * omission means that event is invisible to both.
 *
 * Seen in the wild: `CreditBalanceEvent` omits `CreditLocked` and
 * `SubCreditReseted`, both of which the entity emits.
 */
function eventsMissingFromUnions(
  nodes: DomainNode[],
  eventUnions: EventUnion[],
): Finding[] {
  const events = nodes.filter((n): n is EventNode => n.kind === "event");
  if (events.length === 0 || eventUnions.length === 0) return [];

  const listed = new Set(eventUnions.flatMap((u) => u.memberNames));

  return events
    .filter((event) => !listed.has(event.name))
    .map((event) => ({
      code: "event-missing-from-union" as const,
      message:
        `${event.name} is emitted but appears in no event union type. ` +
        `Repositories and bus listeners typed on the union will not know about it.`,
      nodeId: event.id,
      location: event.location,
    }));
}

function errorsMissingSetPrototype(nodes: DomainNode[]): Finding[] {
  return nodes
    .filter((n): n is ErrorNode => n.kind === "error" && !n.setsPrototype)
    .map((error) => ({
      code: "error-missing-set-prototype" as const,
      message:
        `${error.name} does not call Object.setPrototypeOf in its constructor, ` +
        `so \`err instanceof ${error.name}\` is false at runtime. Matching on ` +
        `\`.name\` still works.`,
      nodeId: error.id,
      location: error.location,
    }));
}

/**
 * Invariants passed as a positional third constructor argument — the pre-1.7.0
 * API. Against 1.7.0 the argument is an options object, so this no longer
 * compiles and the invariants would not be registered.
 */
function legacyInvariantAttachment(nodes: DomainNode[]): Finding[] {
  return nodes
    .filter(
      (n): n is EntityNode =>
        (n.kind === "entity" || n.kind === "valueObject") &&
        n.invariantAttachment === "positionalArray",
    )
    .map((entity) => ({
      code: "legacy-invariant-attachment" as const,
      message:
        `${entity.name} passes its invariants as a positional third argument, ` +
        `which is the pre-1.7.0 API. Use { invariants: [...] } or addInvariant().`,
      nodeId: entity.id,
      location: entity.location,
    }));
}

/**
 * Keep only the type aliases that actually enumerate domain events.
 *
 * The extractor collects every union alias it sees, because an aggregate's
 * event union is declared in a dedicated file in some codebases and inline in
 * the entity file in others. That also sweeps up unrelated aliases such as
 * `BookSearchCriteria`, so they are filtered out once the event set is known.
 */
export function keepEventUnions(
  unions: EventUnion[],
  nodes: DomainNode[],
): EventUnion[] {
  const eventNames = new Set(
    nodes.filter((n) => n.kind === "event").map((n) => n.name),
  );

  return unions.filter((union) =>
    union.memberNames.some((member) => eventNames.has(member)),
  );
}
