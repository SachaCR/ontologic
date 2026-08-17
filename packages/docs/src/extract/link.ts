import type {
  DomainNode,
  Edge,
  EntityNode,
  ErrorNode,
  EventNode,
  NodeId,
} from "./model";

/**
 * Resolve the type names collected during extraction into node ids, and build
 * the edge list.
 *
 * Extraction deliberately records what it *saw written* — `emits: ["OrderPaid"]`
 * — because at that point it has no view of the whole codebase. This pass turns
 * those names into references and, just as importantly, **drops the ones that
 * are not events or errors at all**. Without it, `static create(): { order:
 * Order; creationEvent: OrderCreated }` reports the aggregate itself as one of
 * its own emitted events.
 */
export function linkModel(nodes: DomainNode[]): Edge[] {
  const eventsByName = indexByName(
    nodes.filter((n): n is EventNode => n.kind === "event"),
  );
  const errorsByName = indexByName(
    nodes.filter((n): n is ErrorNode => n.kind === "error"),
  );

  const edges: Edge[] = [];

  for (const node of nodes) {
    if (node.kind !== "entity" && node.kind !== "valueObject") continue;

    for (const method of (node as EntityNode).methods) {
      method.emits = resolveAll(method.emits, eventsByName);
      method.canFail = resolveAll(method.canFail, errorsByName);

      for (const target of method.emits) {
        edges.push({ from: node.id, to: target, kind: "emits", via: method.name });
      }

      for (const target of method.canFail) {
        edges.push({
          from: node.id,
          to: target,
          kind: "canFail",
          via: method.name,
        });
      }
    }
  }

  return dedupeEdges(edges);
}

/**
 * A name may be declared in more than one module — `ENTITY_NOT_FOUND` is
 * defined by three different classes across the example corpora — so an
 * ambiguous name resolves to nothing rather than to an arbitrary winner.
 */
function indexByName<T extends { id: NodeId; name: string }>(
  nodes: T[],
): Map<string, NodeId | null> {
  const index = new Map<string, NodeId | null>();

  for (const node of nodes) {
    index.set(node.name, index.has(node.name) ? null : node.id);
  }

  return index;
}

function resolveAll(
  names: string[],
  index: Map<string, NodeId | null>,
): NodeId[] {
  const resolved: NodeId[] = [];

  for (const name of names) {
    const id = index.get(name);
    if (id) resolved.push(id);
  }

  return [...new Set(resolved)];
}

function dedupeEdges(edges: Edge[]): Edge[] {
  const seen = new Set<string>();

  return edges.filter((edge) => {
    const key = `${edge.from}|${edge.to}|${edge.kind}|${edge.via ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
