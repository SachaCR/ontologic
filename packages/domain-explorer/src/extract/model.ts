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
  | "subEntity"
  | "event"
  | "error"
  | "invariant"
  | "repository"
  | "useCase";

/**
 * A field's type resolved back to its declaration.
 *
 * Recorded during extraction because the printed type is not enough: `OrderItem[]`
 * and `OrderLine[]` are textually identical, yet one is a plain data interface
 * and the other a live sub-entity. Only the declaration separates them.
 */
export interface TypeRef {
  /** The declared symbol name. */
  symbol: string;
  /** Root-relative path of the declaration, so node ids match exactly. */
  file: string;
  /** Collections collapse to "many" — `Map<string, X>`, `X[]`, `Set<X>`. */
  arity: "one" | "many";
  /** Where the reference was found. */
  via: "state" | "privateField";
  /**
   * The union alias this came from, when the field's type was one.
   *
   * A tool declares `#outputType: WorkflowNodeOutputType`, an alias over nine
   * classes — so it resolves to nine references. Rendered as nine separate
   * children that would be nine near-identical blocks per tool; rendered as one
   * `WorkflowNodeOutputType` group it says what the code says: "any one of these".
   */
  family?: string;
  /**
   * What the declaration is. `domainClass` extends DomainEntity/ValueObject;
   * `subEntityClass` is a plain class with `serialize()`/`static fromState` and
   * no heritage — the library's own canonical sub-entity shape; `plain` is an
   * interface or any other class, and never becomes a node.
   */
  declaration: "domainClass" | "subEntityClass" | "plain";
}

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
  /**
   * Declarations this field's type resolves to, after unwrapping collections and
   * expanding unions. A union alias yields several — `tool: WorkflowNodeTool`
   * resolves to all six tool value objects.
   */
  refs?: TypeRef[];
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
  kind: "entity" | "valueObject" | "subEntity";
  name: string;
  /** The `State` type argument. */
  stateTypeName: string;
  /** Present when declared as `DomainEntity<State, Serialized>`. */
  serializedTypeName?: string;
  stateFields: StateField[];
  methods: Method[];
  /**
   * Types this object holds live, gathered from state fields and from private
   * fields. Private fields matter because a value object may keep the live
   * instance there while storing only its serialized form in state — which is
   * where every value-object-to-value-object relationship hides.
   */
  containedRefs: TypeRef[];
  /** Invariants attached to this entity, as node ids. */
  invariants: NodeId[];
  /** How the invariants were attached — a fingerprint of the library version. */
  invariantAttachment:
    "addInvariant" | "optionsObject" | "positionalArray" | "none";
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
  /**
   * Whether this is the port (an interface use cases depend on) or a concrete
   * class. In a ports-and-adapters codebase the port is the one that matters:
   * it is what appears in every use case signature.
   */
  isPort: boolean;
  /** Concrete classes implementing this port, by name. */
  implementations: string[];
  /** Methods beyond the base interface — the domain queries. */
  finders: Method[];
  location: SourceLocation;
}

export interface UseCaseNode {
  id: NodeId;
  kind: "useCase";
  name: string;
  /** The action type argument as written, e.g. `PayOrderCommand`. */
  actionTypeName: string;
  /**
   * Whether the action is a `Command` or a `Query` — resolved by finding the
   * action class and reading which base it extends.
   *
   * `"unknown"` means the action is declared outside the analysed root, so the
   * base class could not be seen. It does not mean the use case is unmarked.
   */
  actionKind: "command" | "query" | "unknown";
  /** The literal name bound by the action, e.g. `PAY_ORDER`. */
  actionName?: string;
  /** Constructor parameters — the aggregates and services it was given. */
  dependencies: { name: string; type: string }[];
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
  | "writes"
  /** The source holds the target. Drives the Explorer's hierarchy. */
  | "contains"
  /** The source names the target by id, without holding it. */
  | "references";

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
    | "use-case-not-marked"
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

/** A box in a Graph diagram, already positioned. */
export interface GraphNode {
  /** Absent for a collapsed family box, which stands for several nodes. */
  id?: NodeId;
  label: string;
  kind: "entity" | "subEntity" | "valueObject" | "event" | "family";
  /** How many members a family box stands for. */
  count?: number;
  x: number;
  y: number;
}

/** One diagram: an aggregate root and everything beneath it. */
export interface GraphLayout {
  rootId: NodeId;
  title: string;
  nodes: GraphNode[];
  /** Indices into `nodes`, so the embedded payload stays small. */
  edges: { from: number; to: number }[];
  width: number;
  height: number;
}

export interface DomainModel {
  /** Absolute path the analysis was rooted at. */
  root: string;
  nodes: DomainNode[];
  edges: Edge[];
  eventUnions: EventUnion[];
  findings: Finding[];
  /**
   * Entities nothing else contains — the Explorer's top level. Derived rather
   * than assumed: most entities in a real bounded context are sub-entities of a
   * root, not roots themselves.
   */
  aggregateRoots: NodeId[];
  /**
   * Precomputed diagrams, one per aggregate root. Laid out at generation time so
   * the layout logic can be tested; the page only draws it.
   */
  graphs: GraphLayout[];
}

export function makeNodeId(
  kind: NodeKind,
  file: string,
  symbol: string,
): NodeId {
  return `${kind}:${file}#${symbol}`;
}
