import type {
  DomainNode,
  Edge,
  EntityNode,
  ErrorNode,
  EventNode,
  InvariantNode,
  NodeId,
  RepositoryNode,
  UseCaseNode,
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

  const invariantsByName = indexByName(
    nodes.filter((n): n is InvariantNode => n.kind === "invariant"),
  );
  const entitiesByName = indexByName(
    nodes.filter(
      (n): n is EntityNode => n.kind === "entity" || n.kind === "valueObject",
    ),
  );
  const repositoriesByName = indexByName(
    nodes.filter((n): n is RepositoryNode => n.kind === "repository"),
  );

  const edges: Edge[] = [];

  for (const node of nodes) {
    if (node.kind === "entity" || node.kind === "valueObject") {
      const entity = node as EntityNode;

      for (const method of entity.methods) {
        method.emits = resolveAll(method.emits, eventsByName);
        method.canFail = resolveAll(method.canFail, errorsByName);

        for (const target of method.emits) {
          edges.push({
            from: node.id,
            to: target,
            kind: "emits",
            via: method.name,
          });
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

      entity.invariants = resolveInvariants(
        entity.invariants,
        invariantsByName,
        nodes,
      );

      for (const target of entity.invariants) {
        edges.push({ from: node.id, to: target, kind: "protectedBy" });
      }

      continue;
    }

    if (node.kind === "repository") {
      const entityId = entitiesByName.get(node.entityTypeName);
      if (entityId) {
        edges.push({ from: node.id, to: entityId, kind: "persists" });
      }
      continue;
    }

    if (node.kind === "useCase") {
      const useCase = node as UseCaseNode;
      useCase.canFail = resolveAll(useCase.canFail, errorsByName);
      useCase.emits = resolveAll(useCase.emits, eventsByName);

      for (const target of useCase.canFail) {
        edges.push({ from: node.id, to: target, kind: "canFail" });
      }

      for (const target of useCase.emits) {
        edges.push({ from: node.id, to: target, kind: "emits" });
      }

      for (const repositoryName of useCase.reads) {
        const target = repositoriesByName.get(repositoryName);
        if (target) edges.push({ from: node.id, to: target, kind: "reads" });
      }

      for (const repositoryName of useCase.writes) {
        const target = repositoriesByName.get(repositoryName);
        if (target) edges.push({ from: node.id, to: target, kind: "writes" });
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

/**
 * Invariant references arrive qualified as `file#name` where the declaration
 * could be reached, and as a bare name otherwise. The qualified form resolves
 * exactly, which matters because sibling modules routinely declare invariants
 * with identical names.
 */
function resolveInvariants(
  references: string[],
  byName: Map<string, NodeId | null>,
  nodes: DomainNode[],
): NodeId[] {
  const resolved: NodeId[] = [];

  for (const reference of references) {
    if (reference.includes("#")) {
      const exact = nodes.find(
        (n) => n.kind === "invariant" && n.id === `invariant:${reference}`,
      );

      if (exact) {
        resolved.push(exact.id);
        continue;
      }
    }

    const name = reference.split("#").pop() ?? reference;
    const id = byName.get(name);
    if (id) resolved.push(id);
  }

  return [...new Set(resolved)];
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
