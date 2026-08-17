/**
 * The extracted domain model.
 *
 * This is deliberately a plain serialisable graph with no behaviour: the
 * extractors produce it, the renderer consumes it, and it can be written out as
 * JSON for other tools. Nothing here may reference the TypeScript compiler.
 */

/** Where a concept was found, for "view source" links and error messages. */
export interface SourceLocation {
  /** Path relative to the analysed root, using forward slashes. */
  file: string;
  line: number;
}

export type NodeKind =
  | "entity"
  | "valueObject"
  | "event"
  | "error"
  | "invariant"
  | "repository"
  | "useCase";

/**
 * A stable identifier of the form `<kind>:<module path>#<symbol>`.
 *
 * The module path is part of the id on purpose: `ENTITY_NOT_FOUND` is declared
 * by three different classes across the example corpora, so the wire name alone
 * would collide. Grouping by display name is a rendering concern.
 */
export type NodeId = string;

export interface StateField {
  name: string;
  type: string;
  optional: boolean;
}

/** A behaviour method on an entity or value object. */
export interface Method {
  name: string;
  isStatic: boolean;
  /** The written return type, kept verbatim — it reads better than a re-print. */
  returnType: string;
  parameters: { name: string; type: string }[];
  /** Events this method produces, as node ids. */
  emits: NodeId[];
  /** Errors this method can return, as node ids. */
  canFail: NodeId[];
  location: SourceLocation;
}

export interface EntityNode {
  id: NodeId;
  kind: "entity" | "valueObject";
  name: string;
  /** The `State` type argument. */
  stateTypeName: string;
  /** Present when declared as `DomainEntity<State, Serialized>`. */
  serializedTypeName?: string;
  stateFields: StateField[];
  methods: Method[];
  /** Invariants attached to this entity, as node ids. */
  invariants: NodeId[];
  /** How the invariants were attached — a fingerprint of the library version. */
  invariantAttachment: "addInvariant" | "optionsObject" | "positionalArray" | "none";
  location: SourceLocation;
}

export interface EventNode {
  id: NodeId;
  kind: "event";
  /** The class name. */
  name: string;
  /** The wire name, from the first type argument. */
  eventName: string;
  version: number;
  payloadTypeName: string;
  payloadFields: StateField[];
  location: SourceLocation;
}

export interface ErrorNode {
  id: NodeId;
  kind: "error";
  name: string;
  /** The discriminant, from the first type argument. */
  errorName: string;
  contextTypeName: string;
  contextFields: StateField[];
  /**
   * Whether the constructor re-sets its prototype. Without it `instanceof` is
   * false for the subclass, because `DomainError`'s own constructor sets the
   * prototype to `DomainError.prototype`.
   */
  setsPrototype: boolean;
  location: SourceLocation;
}

export interface InvariantNode {
  id: NodeId;
  kind: "invariant";
  /** The exported const name. */
  name: string;
  /** The human-readable description — the first constructor argument. */
  description: string;
  /** The `State` type argument, which is the link back to an entity. */
  stateTypeName: string;
  /** Source text of the predicate. Printable, not interpretable. */
  predicate: string;
  location: SourceLocation;
}

export interface RepositoryNode {
  id: NodeId;
  kind: "repository";
  name: string;
  entityTypeName: string;
  eventUnionTypeName: string;
  /** Methods beyond the base interface — the domain queries. */
  finders: Method[];
  location: SourceLocation;
}

export interface UseCaseNode {
  id: NodeId;
  kind: "useCase";
  name: string;
  parameters: { name: string; type: string }[];
  returnType: string;
  /** The success type inside `Result<T, E>`, when there is one. */
  returnsStateTypeName?: string;
  /**
   * The declared error side is `Error` (or equally uninformative), so callers
   * cannot handle failures exhaustively. Recorded during extraction because it
   * is a structural fact about the type node, not something to re-derive from
   * the printed string — `Result<Array<{id: string} & LoanState>, Error>` does
   * not survive a regex.
   */
  errorUnionErased: boolean;
  canFail: NodeId[];
  /** Repository identifiers this use case reads from / writes to. */
  reads: string[];
  writes: string[];
  /** How confident the detection was — use cases have no base class. */
  confidence: "high" | "medium" | "low";
  location: SourceLocation;
}

export type DomainNode =
  | EntityNode
  | EventNode
  | ErrorNode
  | InvariantNode
  | RepositoryNode
  | UseCaseNode;

export type EdgeKind =
  | "emits"
  | "canFail"
  | "protectedBy"
  | "persists"
  | "reads"
  | "writes";

export interface Edge {
  from: NodeId;
  to: NodeId;
  kind: EdgeKind;
  /** Optional label, e.g. the method that emits the event. */
  via?: string;
}

/** A self-contradiction found in the analysed codebase. */
export interface Finding {
  code:
    | "event-missing-from-union"
    | "error-missing-set-prototype"
    | "invariant-never-attached"
    | "use-case-error-union-erased"
    | "legacy-invariant-attachment";
  message: string;
  /** The node the finding is attached to. */
  nodeId: NodeId;
  location: SourceLocation;
}

/** An event union type alias, kept so it can be checked against reality. */
export interface EventUnion {
  name: string;
  memberNames: string[];
  location: SourceLocation;
}

export interface DomainModel {
  /** Absolute path the analysis was rooted at. */
  root: string;
  nodes: DomainNode[];
  edges: Edge[];
  eventUnions: EventUnion[];
  findings: Finding[];
}

export function makeNodeId(kind: NodeKind, file: string, symbol: string): NodeId {
  return `${kind}:${file}#${symbol}`;
}
