import type {
  DomainModel,
  DomainNode,
  EntityNode,
  GraphLayout,
  GraphNode,
  NodeId,
} from "../extract/model";

/**
 * Layout for the Graph section: one diagram per aggregate root showing what it
 * holds, what those hold, and the events they emit.
 *
 * Computed here rather than in the browser so it can be type-checked and tested.
 * Tree building has real decisions in it — which families to expand, what counts
 * as a child — and every serious bug in this tool so far has come from logic that
 * nothing could assert on.
 *
 * Errors are excluded by construction: this view is about structure and what it
 * produces, and a bounded context's error count would swamp both.
 */

const COLUMN = 208;
const ROW = 30;
const BOX_W = 172;
const BOX_H = 24;
const PAD = 16;
const MAX_DEPTH = 6;

interface Branch {
  node?: DomainNode;
  label: string;
  kind: GraphNode["kind"];
  count?: number;
  children: Branch[];
  x: number;
  y: number;
}

export function buildGraphLayouts(model: DomainModel): GraphLayout[] {
  const byId = new Map(model.nodes.map((n) => [n.id, n]));

  const roots = model.aggregateRoots
    .map((id) => byId.get(id))
    .filter((n): n is DomainNode => n !== undefined);

  // A codebase with no containment has no roots to distinguish, so every entity
  // is one.
  const effective =
    roots.length > 0 ? roots : model.nodes.filter((n) => n.kind === "entity");

  return effective.map((root) => layoutFor(root, model, byId));
}

function layoutFor(
  root: DomainNode,
  model: DomainModel,
  byId: Map<NodeId, DomainNode>,
): GraphLayout {
  const tree = buildBranch(root, model, byId, 0, []);
  const height = place(tree, 0, { y: 0 });

  const nodes: GraphNode[] = [];
  const edges: { from: number; to: number }[] = [];

  const emit = (branch: Branch): number => {
    const index = nodes.length;

    const node: GraphNode = {
      label: branch.label,
      kind: branch.kind,
      x: branch.x,
      y: branch.y,
    };

    if (branch.node) node.id = branch.node.id;
    if (branch.count !== undefined) node.count = branch.count;

    nodes.push(node);

    for (const child of branch.children) {
      edges.push({ from: index, to: emit(child) });
    }

    return index;
  };

  emit(tree);

  const maxX = nodes.reduce((max, n) => Math.max(max, n.x), 0);

  return {
    rootId: root.id,
    title: root.name,
    nodes,
    edges,
    width: maxX + BOX_W + PAD,
    height: Math.max(height + PAD * 2, BOX_H + PAD * 2),
  };
}

function buildBranch(
  node: DomainNode,
  model: DomainModel,
  byId: Map<NodeId, DomainNode>,
  depth: number,
  ancestors: NodeId[],
): Branch {
  const branch: Branch = {
    node,
    label: node.name,
    kind: graphKindOf(node),
    children: [],
    x: 0,
    y: 0,
  };

  if (depth >= MAX_DEPTH || ancestors.includes(node.id)) return branch;

  const path = [...ancestors, node.id];

  const families = new Map<string, DomainNode[]>();
  const loose: DomainNode[] = [];

  for (const edge of model.edges) {
    if (edge.kind !== "contains" || edge.from !== node.id) continue;

    const target = byId.get(edge.to);
    if (!target) continue;

    const family = familyOf(node, target);
    if (family) {
      families.set(family, [...(families.get(family) ?? []), target]);
    } else {
      loose.push(target);
    }
  }

  for (const target of loose) {
    branch.children.push(buildBranch(target, model, byId, depth + 1, path));
  }

  for (const [family, members] of families) {
    // Expanding a family earns its space only when the members differ in what
    // they hold. Six tools do; nine interchangeable output types do not.
    const worthExpanding = members.some((member) =>
      hasChildren(member, model),
    );

    if (worthExpanding) {
      for (const member of members) {
        branch.children.push(buildBranch(member, model, byId, depth + 1, path));
      }
      continue;
    }

    branch.children.push({
      label: family,
      kind: "family",
      count: members.length,
      children: [],
      x: 0,
      y: 0,
    });
  }

  for (const event of emittedBy(node.id, model, byId)) {
    branch.children.push({
      node: event,
      label: event.name,
      kind: "event",
      children: [],
      x: 0,
      y: 0,
    });
  }

  return branch;
}

/** Events an object emits, once each however many methods emit them. */
function emittedBy(
  id: NodeId,
  model: DomainModel,
  byId: Map<NodeId, DomainNode>,
): DomainNode[] {
  const seen = new Set<NodeId>();
  const events: DomainNode[] = [];

  for (const edge of model.edges) {
    if (edge.kind !== "emits" || edge.from !== id || seen.has(edge.to)) continue;

    const node = byId.get(edge.to);
    if (!node) continue;

    seen.add(edge.to);
    events.push(node);
  }

  return events;
}

function hasChildren(node: DomainNode, model: DomainModel): boolean {
  return model.edges.some(
    (e) => e.from === node.id && (e.kind === "contains" || e.kind === "emits"),
  );
}

/** The union alias a child came from, when the holder recorded one. */
function familyOf(holder: DomainNode, target: DomainNode): string | undefined {
  const refs = (holder as EntityNode).containedRefs;
  if (!refs) return undefined;

  return refs.find((ref) => ref.symbol === target.name && ref.family)?.family;
}

function graphKindOf(node: DomainNode): GraphNode["kind"] {
  switch (node.kind) {
    case "entity":
    case "subEntity":
    case "valueObject":
    case "event":
      return node.kind;
    default:
      return "entity";
  }
}

/**
 * Left-to-right tidy tree: depth sets x, leaves stack down a running cursor, and
 * a parent centres between its first and last child.
 *
 * Left-to-right because the labels are long identifiers — top-down would need
 * either very wide columns or truncation that hides which tool is which.
 */
function place(branch: Branch, depth: number, cursor: { y: number }): number {
  branch.x = PAD + depth * COLUMN;

  if (branch.children.length === 0) {
    branch.y = cursor.y;
    cursor.y += ROW;
    return cursor.y;
  }

  for (const child of branch.children) place(child, depth + 1, cursor);

  const first = branch.children[0];
  const last = branch.children[branch.children.length - 1];
  branch.y = first && last ? (first.y + last.y) / 2 : cursor.y;

  return cursor.y;
}

export const GRAPH_GEOMETRY = { COLUMN, ROW, BOX_W, BOX_H, PAD, MAX_DEPTH };
