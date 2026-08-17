import { describe, it, expect, beforeAll } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { extractModel } from "../index";
import type { DomainModel, GraphLayout } from "../extract/model";

const REPO_ROOT = resolve(__dirname, "..", "..", "..", "..");
const WORKFLOW_V2 =
  "/Users/sacha/dev/web-apps/apps/backend/src/bounded-contexts/workflow-v2";

function graphNamed(model: DomainModel, title: string): GraphLayout {
  const found = model.graphs.find((g) => g.title === title);
  if (!found) throw new Error(`no graph for ${title}`);
  return found;
}

/** Labels of the direct children of the node at `index`. */
function childrenOf(layout: GraphLayout, index: number): string[] {
  return layout.edges
    .filter((e) => e.from === index)
    .map((e) => layout.nodes[e.to]?.label ?? "?")
    .sort();
}

function indexOfLabel(layout: GraphLayout, label: string): number {
  return layout.nodes.findIndex((n) => n.label === label);
}

describe.skipIf(!existsSync(WORKFLOW_V2))(
  "Given a bounded context with nested aggregates, tools and events",
  () => {
    let model: DomainModel;
    let workflow: GraphLayout;

    beforeAll(() => {
      model = extractModel({ paths: [WORKFLOW_V2] });
      workflow = graphNamed(model, "Workflow");
    });

    describe("When the graph layouts are built", () => {
      it("Then there is one diagram per aggregate root", () => {
        expect(model.graphs.map((g) => g.title).sort()).toEqual([
          "Workflow",
          "WorkflowInstance",
        ]);
      });

      it("Then no error appears anywhere in any diagram", () => {
        // The explicit requirement. A careless edge query would pull canFail in
        // alongside emits and bury the structure under 17 error boxes.
        const errorNames = new Set(
          model.nodes.filter((n) => n.kind === "error").map((n) => n.name),
        );

        for (const graph of model.graphs) {
          for (const node of graph.nodes) {
            expect(errorNames.has(node.label)).toBe(false);
          }
        }
      });

      it("Then a family whose members have structure is expanded", () => {
        // WorkflowNodeTool covers six tools that differ, so showing them is
        // worth the space. The node also emits events, which sit alongside.
        const children = childrenOf(workflow, indexOfLabel(workflow, "WorkflowNode"));

        for (const tool of [
          "AIMatchTool",
          "ExactMatchTool",
          "LLMTool",
          "ManualInputTool",
          "PythonTool",
          "WebSearchTool",
        ]) {
          expect(children).toContain(tool);
        }

        expect(indexOfLabel(workflow, "WorkflowNodeTool")).toBe(-1);
      });

      it("Then a family of interchangeable leaves is collapsed to one box", () => {
        const tool = indexOfLabel(workflow, "LLMTool");
        const children = childrenOf(workflow, tool);

        expect(children).toEqual(["NodeReference", "WorkflowNodeOutputType"]);

        const family = workflow.nodes.find(
          (n) => n.label === "WorkflowNodeOutputType",
        );

        expect(family?.kind).toBe("family");
        expect(family?.count).toBe(9);
        expect(family?.id).toBeUndefined();
      });

      it("Then events hang off the object that emits them", () => {
        const root = indexOfLabel(workflow, "Workflow");

        expect(childrenOf(workflow, root)).toContain("WorkflowCreated");
        expect(childrenOf(workflow, root)).toContain("WorkflowNode");
      });

      it("Then an event emitted by several methods appears once per emitter", () => {
        // Deduplication is per emitter, not global. WorkflowNodeToolUpdated
        // legitimately hangs off both WorkflowNode and Workflow, because
        // Workflow.updateNodeTool re-declares its delegate's return type — both
        // really do emit it, and collapsing that would hide a real relationship.
        for (const graph of model.graphs) {
          const perParent = new Map<number, string[]>();

          for (const edge of graph.edges) {
            const child = graph.nodes[edge.to];
            if (child?.kind !== "event") continue;
            perParent.set(edge.from, [
              ...(perParent.get(edge.from) ?? []),
              child.label,
            ]);
          }

          for (const [, labels] of perParent) {
            expect(labels).toHaveLength(new Set(labels).size);
          }
        }

        const shared = workflow.nodes.filter(
          (n) => n.label === "WorkflowNodeToolUpdated",
        );
        expect(shared).toHaveLength(2);
      });

      it("Then the diagram stays the size that was measured", () => {
        // Expanding every family gave 75 nodes and ~2000px; collapsing them all
        // gave 11 and hid the tools. This is the middle that was chosen.
        expect(workflow.nodes.length).toBeGreaterThan(20);
        expect(workflow.nodes.length).toBeLessThan(40);
        expect(workflow.height).toBeLessThan(900);
      });

      it("Then every edge points at a node that exists", () => {
        for (const graph of model.graphs) {
          for (const edge of graph.edges) {
            expect(graph.nodes[edge.from]).toBeDefined();
            expect(graph.nodes[edge.to]).toBeDefined();
          }
        }
      });

      it("Then no node is drawn outside the declared canvas", () => {
        for (const graph of model.graphs) {
          for (const node of graph.nodes) {
            expect(node.x).toBeGreaterThanOrEqual(0);
            expect(node.x).toBeLessThan(graph.width);
            expect(node.y).toBeLessThan(graph.height);
          }
        }
      });

      it("Then a node is never its own ancestor", () => {
        for (const graph of model.graphs) {
          const parent = new Map<number, number>();
          for (const edge of graph.edges) parent.set(edge.to, edge.from);

          for (const [child] of parent) {
            const seen = new Set<number>([child]);
            let current = parent.get(child);

            while (current !== undefined) {
              expect(seen.has(current)).toBe(false);
              seen.add(current);
              current = parent.get(current);
            }
          }
        }
      });
    });
  },
);

describe("Given a codebase whose aggregates contain nothing", () => {
  let model: DomainModel;

  beforeAll(() => {
    model = extractModel({
      paths: [resolve(REPO_ROOT, "src/examples/order")],
    });
  });

  describe("When the graph layouts are built", () => {
    it("Then it still produces a diagram of the aggregate and its events", () => {
      const order = graphNamed(model, "Order");

      expect(order.nodes[0]?.label).toBe("Order");
      expect(order.nodes.every((n) => n.kind === "entity" || n.kind === "event")).toBe(
        true,
      );
      expect(order.nodes.length).toBeGreaterThan(1);
    });
  });
});
