import { describe, it, expect, beforeAll } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { extractModel } from "../index";
import type { DomainModel, EntityNode } from "../extract/model";

const REPO_ROOT = resolve(__dirname, "..", "..", "..", "..");

function nameOf(model: DomainModel, id: string): string {
  return model.nodes.find((n) => n.id === id)?.name ?? id;
}

/** Names of everything `name` contains, sorted. */
function contains(model: DomainModel, name: string): string[] {
  const node = model.nodes.find((n) => n.name === name);
  if (!node) throw new Error(`no node named ${name}`);

  return model.edges
    .filter((e) => e.kind === "contains" && e.from === node.id)
    .map((e) => nameOf(model, e.to))
    .sort();
}

function references(model: DomainModel, name: string): string[] {
  const node = model.nodes.find((n) => n.name === name);
  if (!node) throw new Error(`no node named ${name}`);

  return model.edges
    .filter((e) => e.kind === "references" && e.from === node.id)
    .map((e) => nameOf(model, e.to))
    .sort();
}

// The rich fixture: 5 entities, 18 value objects, containment through Maps,
// union aliases and private fields. Skipped when the checkout is absent.
const WORKFLOW_V2 =
  "/Users/sacha/dev/web-apps/apps/backend/src/bounded-contexts/workflow-v2";

describe.skipIf(!existsSync(WORKFLOW_V2))(
  "Given a bounded context with nested aggregates and value objects",
  () => {
    let model: DomainModel;

    beforeAll(() => {
      model = extractModel({ paths: [WORKFLOW_V2] });
    });

    describe("When containment is extracted", () => {
      it("Then tooling directories are not read as domain code", () => {
        // A project that has run `ontologic init-agents` carries reference
        // aggregates under .claude/skills/. Documenting those invents concepts
        // the codebase does not have — this repo really did grow a phantom
        // "Subscription" aggregate that way.
        expect(model.nodes.some((n) => n.location.file.startsWith("."))).toBe(
          false,
        );
        expect(model.nodes.some((n) => n.name === "Subscription")).toBe(false);
      });

      it("Then only the aggregate roots are top level", () => {
        // Three of the five entities are held by another entity, so opening the
        // Explorer on all five would present children as top-level concepts.
        expect(
          model.aggregateRoots.map((id) => nameOf(model, id)).sort(),
        ).toEqual(["Workflow", "WorkflowInstance"]);
      });

      it("Then containment through a Map is found", () => {
        expect(contains(model, "Workflow")).toEqual(["WorkflowNode"]);
        expect(contains(model, "WorkflowInstance")).toEqual([
          "NodeValue",
          "WorkflowRun",
        ]);
      });

      it("Then a collection is marked as holding many", () => {
        const workflow = model.nodes.find((n) => n.name === "Workflow");
        const edge = model.edges.find(
          (e) => e.kind === "contains" && e.from === workflow?.id,
        );

        expect(edge?.via).toBe("many");
      });

      it("Then a union alias expands to every member", () => {
        // `tool: WorkflowNodeTool` is an alias over six tool value objects.
        expect(contains(model, "WorkflowNode")).toEqual([
          "AIMatchTool",
          "ExactMatchTool",
          "LLMTool",
          "ManualInputTool",
          "PythonTool",
          "WebSearchTool",
        ]);
      });

      it("Then the union members record the family they came from", () => {
        const node = model.nodes.find(
          (n) => n.name === "WorkflowNode",
        ) as EntityNode;

        const families = new Set(
          node.containedRefs.map((r) => r.family).filter(Boolean),
        );

        expect([...families]).toEqual(["WorkflowNodeTool"]);
      });

      it("Then value objects held only in private fields are found", () => {
        // The tools store `outputType.readState()` in state and keep the live
        // instance in `#outputType`, so a state-only pass finds nothing here.
        const held = contains(model, "LLMTool");

        expect(held).toContain("NodeReference");
        expect(held).toContain("TextOutputType");
        expect(held).toContain("JsonOutputType");
      });

      it("Then a value object held directly by an entity is found", () => {
        expect(contains(model, "WorkflowRun")).toEqual(["ExecutionPlan"]);
      });

      it("Then an entity with two type arguments and a serialize still holds nothing", () => {
        // NodeValue supplies `serialize` purely to drop an internal field. The
        // tempting heuristic — two type args plus serialize means "holds live
        // sub-objects" — is wrong here, and this is the case that proves it.
        const nodeValue = model.nodes.find(
          (n) => n.name === "NodeValue",
        ) as EntityNode;

        expect(nodeValue.serializedTypeName).toBe("NodeValueDTO");
        expect(contains(model, "NodeValue")).toEqual([]);
      });

      it("Then a plain interface in state is not treated as containment", () => {
        // NodeValueState.result is `WorkflowNodeTaskResult`, a plain interface.
        expect(
          model.nodes.some((n) => n.name === "WorkflowNodeTaskResult"),
        ).toBe(false);
      });

      it("Then an infrastructure class in a private field is not a domain concept", () => {
        // WorkflowGraph holds `#graph: Graph` from a graph library.
        expect(contains(model, "WorkflowGraph")).toEqual([]);
        expect(model.nodes.some((n) => n.name === "Graph")).toBe(false);
      });

      it("Then id fields are references, never containment", () => {
        expect(references(model, "WorkflowInstance")).toEqual(["Workflow"]);
        expect(references(model, "NodeValue")).toEqual([
          "WorkflowInstance",
          "WorkflowNode",
        ]);
      });

      it("Then a child never contains its own parent", () => {
        // WorkflowRunState.workflowInstanceId is a back-reference. Treating id
        // fields as containment would make the hierarchy cyclic.
        expect(contains(model, "WorkflowRun")).not.toContain(
          "WorkflowInstance",
        );
        expect(references(model, "WorkflowRun")).toContain("WorkflowInstance");
      });
    });
  },
);

describe("Given the library's canonical aggregate-with-sub-entities example", () => {
  let model: DomainModel;

  beforeAll(() => {
    // The fixture lives in a __tests__ directory, which the file walker skips by
    // default — without includeTests this suite would pass while proving nothing.
    model = extractModel({
      paths: [resolve(REPO_ROOT, "packages/ontologic/src/__tests__/aggregateWithSubEntities.test.ts")],
      includeTests: true,
    });
  });

  describe("When containment is extracted", () => {
    it("Then the sub-entity is promoted to a node despite having no heritage", () => {
      // OrderLine is a plain class with serialize() and static fromState, and no
      // extends clause — so the entity extractor cannot see it on its own.
      const orderLine = model.nodes.find((n) => n.name === "OrderLine");

      expect(orderLine?.kind).toBe("subEntity");
    });

    it("Then the aggregate contains it", () => {
      expect(contains(model, "Cart")).toEqual(["OrderLine"]);
    });
  });
});

describe("Given an aggregate whose state holds plain data", () => {
  let model: DomainModel;

  beforeAll(() => {
    model = extractModel({
      paths: [resolve(REPO_ROOT, "packages/ontologic/src/examples/order")],
    });
  });

  describe("When containment is extracted", () => {
    it("Then a plain interface never becomes a node", () => {
      // OrderState.items is OrderItem[] — textually identical in shape to
      // OrderLine[], but OrderItem is an interface and must stay invisible.
      expect(model.nodes.some((n) => n.name === "OrderItem")).toBe(false);
      expect(contains(model, "Order")).toEqual([]);
    });

    it("Then an aggregate that contains nothing is still a root", () => {
      expect(model.aggregateRoots.map((id) => nameOf(model, id))).toEqual([
        "Order",
      ]);
    });
  });
});

describe("Given an entity held inside another entity", () => {
  let model: DomainModel;

  beforeAll(() => {
    model = extractModel({
      paths: [resolve(__dirname, "fixtures/containedEntity.ts")],
    });
  });

  describe("When the model is extracted", () => {
    it("Then the contained entity is an entity that is not a root", () => {
      // The pair the renderer badges from. Extending DomainEntity is what makes
      // Vehicle an entity; being held by Fleet is what stops it being an
      // aggregate, and reading only the first of those labels it AGG.
      const vehicle = model.nodes.find((n) => n.name === "Vehicle");

      expect(vehicle?.kind).toBe("entity");
      expect(model.aggregateRoots).not.toContain(vehicle?.id);
    });

    it("Then only the holder is a root", () => {
      expect(model.aggregateRoots.map((id) => nameOf(model, id))).toEqual([
        "Fleet",
      ]);
    });

    it("Then a sub-entity is neither", () => {
      const odometer = model.nodes.find((n) => n.name === "Odometer");

      expect(odometer?.kind).toBe("subEntity");
      expect(model.aggregateRoots).not.toContain(odometer?.id);
    });
  });
});
