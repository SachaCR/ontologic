import ts from "typescript";

import type { DomainNode, EntityNode, Edge, TypeRef } from "./model";
import { makeNodeId } from "./model";
import {
  eachSourceFile,
  locationOf,
  membersOfTypeNode,
  type ExtractContext,
} from "./ts-utils";

/**
 * Turns resolved type references into the containment graph the Explorer needs,
 * and promotes sub-entities the entity extractor cannot see.
 */

/**
 * Classes reached by containment that are plain classes with `serialize()` or
 * `static fromState` and no heritage — the library's own canonical sub-entity
 * shape. `extractEntities` gates on `extends DomainEntity | ValueObject`, so
 * without this pass an aggregate's sub-entities are invisible.
 */
export function extractSubEntities(
  ctx: ExtractContext,
  entities: EntityNode[],
): EntityNode[] {
  const wanted = new Map<string, TypeRef>();

  for (const entity of entities) {
    for (const ref of entity.containedRefs) {
      if (ref.declaration !== "subEntityClass") continue;
      wanted.set(`${ref.file}#${ref.symbol}`, ref);
    }
  }

  if (wanted.size === 0) return [];

  const found: EntityNode[] = [];

  eachSourceFile(ctx, (sf) => {
    sf.forEachChild((node) => {
      if (!ts.isClassDeclaration(node) || !node.name) return;

      const location = locationOf(node, ctx.root);
      const key = `${location.file}#${node.name.text}`;
      if (!wanted.has(key)) return;

      found.push(toSubEntityNode(node, location, ctx));
    });
  });

  return found;
}

function toSubEntityNode(
  node: ts.ClassDeclaration,
  location: EntityNode["location"],
  ctx: ExtractContext,
): EntityNode {
  const sf = node.getSourceFile();
  const name = node.name?.text ?? "(anonymous)";

  // A sub-entity has no State type argument to read, so its shape comes from the
  // constructor parameter that carries it — conventionally `<Name>State`.
  const ctor = node.members.find(ts.isConstructorDeclaration);
  const stateParam = ctor?.parameters[0];
  const stateTypeName = stateParam?.type
    ? stateParam.type.getText(sf).replace(/\s+/g, " ")
    : "unknown";

  return {
    id: makeNodeId("subEntity", location.file, name),
    kind: "subEntity",
    name,
    stateTypeName,
    stateFields: membersOfTypeNode(stateParam?.type, ctx),
    methods: [],
    containedRefs: [],
    invariants: [],
    invariantAttachment: "none",
    location,
  };
}

/** Field-name patterns that name another aggregate by id rather than holding it. */
const ID_FIELD = /^(.*?)(Id|Ids)$/;

/**
 * Containment and reference edges.
 *
 * These are kept apart deliberately. Treating an id field as containment would
 * invent a `WorkflowRun → WorkflowInstance` edge — a child pointing back at its
 * own parent — and the Explorer's hierarchy would contain cycles.
 */
export function linkContainment(nodes: DomainNode[]): Edge[] {
  const holders = nodes.filter(
    (n): n is EntityNode =>
      n.kind === "entity" || n.kind === "valueObject" || n.kind === "subEntity",
  );

  const byQualifiedName = new Map<string, DomainNode>();
  const byName = new Map<string, DomainNode | null>();

  for (const node of holders) {
    byQualifiedName.set(`${node.location.file}#${node.name}`, node);
    byName.set(node.name, byName.has(node.name) ? null : node);
  }

  const edges: Edge[] = [];

  for (const holder of holders) {
    for (const ref of holder.containedRefs) {
      if (ref.declaration === "plain") continue;

      const target = byQualifiedName.get(`${ref.file}#${ref.symbol}`);
      if (!target || target.id === holder.id) continue;

      edges.push({
        from: holder.id,
        to: target.id,
        kind: "contains",
        ...(ref.arity === "many" ? { via: "many" } : {}),
      });
    }

    for (const field of holder.stateFields) {
      const target = referencedAggregate(field.name, field.type, byName);
      if (!target || target.id === holder.id) continue;

      edges.push({
        from: holder.id,
        to: target.id,
        kind: "references",
        via: field.name,
      });
    }
  }

  return dedupe(edges);
}

/**
 * `workflowNodeId: string` names the `WorkflowNode` aggregate. Only id-shaped
 * fields carrying strings qualify, so a field that merely happens to share a
 * name with an aggregate is not mistaken for a reference.
 */
function referencedAggregate(
  fieldName: string,
  fieldType: string,
  byName: Map<string, DomainNode | null>,
): DomainNode | undefined {
  if (!/^string(\[\])?$/.test(fieldType)) return undefined;

  const match = ID_FIELD.exec(fieldName);
  const stem = match?.[1];
  if (!stem) return undefined;

  const candidate = stem.charAt(0).toUpperCase() + stem.slice(1);
  return byName.get(candidate) ?? undefined;
}

/**
 * Aggregate roots: entities nothing else contains.
 *
 * Worth deriving rather than assuming — in a real bounded context only two of
 * five entities are roots, and opening the Explorer on all five would present
 * three children as though they were top-level concepts.
 */
export function aggregateRoots(nodes: DomainNode[], edges: Edge[]): string[] {
  const contained = new Set(
    edges.filter((e) => e.kind === "contains").map((e) => e.to),
  );

  return nodes
    .filter((n) => n.kind === "entity" && !contained.has(n.id))
    .map((n) => n.id);
}

function dedupe(edges: Edge[]): Edge[] {
  const seen = new Set<string>();

  return edges.filter((edge) => {
    const key = `${edge.from}|${edge.to}|${edge.kind}|${edge.via ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
