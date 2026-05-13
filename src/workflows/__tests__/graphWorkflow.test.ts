import { randomUUID } from "node:crypto";

import { describe, test, expect, vi } from "vitest";

import { GraphWorkflow, WorkflowNode } from "../graph";
import { WorkflowState } from "../interfaces";
import {
  InMemoryWorkflowStateRepository,
  WorkflowStateRepository,
} from "../repository";

function makeContext<I>(input: I): WorkflowState<I> {
  return {
    id: randomUUID(),
    name: "test",
    input,
    status: "TODO",
    stepResults: new Map<string, unknown>(),
    error: undefined,
  };
}

describe("WorkflowNode", () => {
  test("leaf node executes its handler and returns the output", async () => {
    const leaf = new WorkflowNode({
      name: "leaf",
      children: {},
      handler: async () => ({ value: 42 }),
    });

    const result = await leaf.execute();

    expect(result).toStrictEqual({ value: 42 });
  });

  test("node receives its child's output keyed by the child slot name", async () => {
    const source = new WorkflowNode({
      name: "source",
      children: {},
      handler: async () => ({ data: [1, 2, 3] }),
    });

    const sum = new WorkflowNode({
      name: "sum",
      children: { source },
      handler: async (input) => ({
        sum: input.source.data.reduce((a, b) => a + b),
      }),
    });

    const result = await sum.execute();

    expect(result).toStrictEqual({ sum: 6 });
  });

  test("aggregates multiple children outputs into a name-keyed record", async () => {
    const a = new WorkflowNode({
      name: "a",
      children: {},
      handler: async () => ({ a: 1 }),
    });
    const b = new WorkflowNode({
      name: "b",
      children: {},
      handler: async () => ({ b: "two" }),
    });

    const combine = new WorkflowNode({
      name: "combine",
      children: { a, b },
      handler: async (input) => ({
        a: input.a.a,
        b: input.b.b,
      }),
    });

    const result = await combine.execute();

    expect(result).toStrictEqual({ a: 1, b: "two" });
  });

  test("runs sibling children concurrently", async () => {
    let signalSecond!: () => void;
    const secondStarted = new Promise<void>((resolve) => {
      signalSecond = resolve;
    });

    const first = vi.fn(async () => {
      await secondStarted;
      return "first";
    });
    const second = vi.fn(async () => {
      signalSecond();
      return "second";
    });

    const parent = new WorkflowNode({
      name: "parent",
      children: {
        first: new WorkflowNode({
          name: "first",
          children: {},
          handler: first,
        }),
        second: new WorkflowNode({
          name: "second",
          children: {},
          handler: second,
        }),
      },
      handler: async (input) => `${input.first}-${input.second}`,
    });

    const result = await parent.execute();

    expect(result).toBe("first-second");
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  test("reuses cached output from context.stepResults and skips the handler", async () => {
    const handler = vi.fn(async () => ({ data: "fresh" }));
    const node = new WorkflowNode({
      name: "cached",
      children: {},
      handler,
    });

    const context = makeContext({});
    context.stepResults.set("cached", { data: "from-cache" });
    node.setContext(context);

    const result = await node.execute();

    expect(result).toStrictEqual({ data: "from-cache" });
    expect(handler).not.toHaveBeenCalled();
  });

  test("wraps handler errors with the step name and preserves the cause", async () => {
    const original = new Error("boom");
    const node = new WorkflowNode({
      name: "failing",
      children: {},
      handler: async () => {
        throw original;
      },
    });

    await expect(node.execute()).rejects.toMatchObject({
      message: expect.stringMatching(/failing/),
      cause: original,
    });
  });

  test("sets context status and error on failure", async () => {
    const node = new WorkflowNode({
      name: "failing",
      children: {},
      handler: async () => {
        throw new Error("boom");
      },
    });

    const context = makeContext({});
    node.setContext(context);

    await expect(node.execute()).rejects.toThrow(/failing/);

    expect(context.status).toBe("FAILED");
    expect(context.error).toEqual({
      step: "failing",
      error: expect.stringMatching(/failing/),
      name: "Error",
    });
  });

  test("emits START then DONE through onChanges on success", async () => {
    const events: Array<{ step: string; status: string }> = [];

    const node = new WorkflowNode({
      name: "ok",
      children: {},
      handler: async () => "value",
    });
    node.onChanges((event) =>
      events.push({ step: event.step, status: event.status }),
    );

    await node.execute();

    expect(events).toStrictEqual([
      { step: "ok", status: "START" },
      { step: "ok", status: "DONE" },
    ]);
  });

  test("emits FAILED through onChanges on handler failure", async () => {
    const events: Array<{
      step: string;
      status: string;
      error?: Error | undefined;
    }> = [];

    const node = new WorkflowNode({
      name: "fails",
      children: {},
      handler: async () => {
        throw new Error("boom");
      },
    });

    node.onChanges((event) => {
      if (event.status === "FAILED") {
        events.push({
          step: event.step,
          status: event.status,
          error: "error" in event ? event.error : undefined,
        });
      }
    });

    await expect(node.execute()).rejects.toThrow();

    expect(events.map((e) => e.status)).toStrictEqual(["FAILED"]);

    expect(events[0]!.error?.cause).toBeInstanceOf(Error);
  });

  test("onChanges propagates to descendants", async () => {
    const events: string[] = [];

    const child = new WorkflowNode({
      name: "child",
      children: {},
      handler: async () => 1,
    });
    const parent = new WorkflowNode({
      name: "parent",
      children: { child },
      handler: async () => 2,
    });

    parent.onChanges((event) => events.push(`${event.step}:${event.status}`));

    await parent.execute();

    expect(events).toContain("child:START");
    expect(events).toContain("child:DONE");
    expect(events).toContain("parent:START");
    expect(events).toContain("parent:DONE");
  });

  test("setContext propagates to descendants so caching works through the tree", async () => {
    const childHandler = vi.fn(async () => "fresh-child");
    const parentHandler = vi.fn(async () => "fresh-parent");

    const child = new WorkflowNode({
      name: "child",
      children: {},
      handler: childHandler,
    });
    const parent = new WorkflowNode({
      name: "parent",
      children: { child },
      handler: parentHandler,
    });

    const context = makeContext({});
    context.stepResults.set("child", "cached-child");
    parent.setContext(context);

    await parent.execute();

    expect(childHandler).not.toHaveBeenCalled();
    expect(parentHandler).toHaveBeenCalledTimes(1);
  });

  test("getGraph returns a nested name/childs structure of the graph", () => {
    const dataSource = new WorkflowNode({
      name: "Data Source",
      children: {},
      handler: async () => ({}),
    });
    const sum = new WorkflowNode({
      name: "Sum",
      children: { source: dataSource },
      handler: async () => ({}),
    });
    const tag = new WorkflowNode({
      name: "Tag",
      children: {},
      handler: async () => ({}),
    });
    const combine = new WorkflowNode({
      name: "Combine",
      children: { sum, tag },
      handler: async () => ({}),
    });

    expect(combine.getGraph()).toStrictEqual({
      name: "Combine",
      childs: [
        {
          name: "Sum",
          childs: [{ name: "Data Source", childs: [] }],
        },
        { name: "Tag", childs: [] },
      ],
    });
  });
});

describe("GraphWorkflow", () => {
  class TestWorkflow extends GraphWorkflow<{ start: number }, number> {
    constructor(params: {
      id: string;
      input: { start: number };
      repository: WorkflowStateRepository;
    }) {
      super({ ...params, name: "test" });
      this.build((input) => this.#root(input));
    }

    #root(input: { start: number }) {
      const a = new WorkflowNode({
        name: "a",
        children: {},
        handler: async () => input.start + 1,
      });
      const b = new WorkflowNode({
        name: "b",
        children: {},
        handler: async () => input.start * 2,
      });
      return new WorkflowNode({
        name: "root",
        children: { a, b },
        handler: async ({ a, b }) => a + b,
      });
    }
  }

  test("executes the root node and returns its output", async () => {
    const repository = new InMemoryWorkflowStateRepository();
    const workflow = new TestWorkflow({
      id: randomUUID(),
      input: { start: 4 },
      repository,
    });

    const result = await workflow.execute();

    // root = (4 + 1) + (4 * 2) = 13
    expect(result).toBe(13);
  });

  test("saves state through the repository after a successful run", async () => {
    const repository = new InMemoryWorkflowStateRepository();
    const id = randomUUID();
    const workflow = new TestWorkflow({
      id,
      input: { start: 4 },
      repository,
    });

    await workflow.execute();

    const persisted = await repository.getById(id);

    expect(persisted).toMatchObject({
      id,
      name: "test",
      input: { start: 4 },
      status: "DONE",
    });
    expect(persisted!.stepResults.get("root")).toBe(13);
  });

  test("state getter reflects the workflow's current state", async () => {
    const repository = new InMemoryWorkflowStateRepository();
    const id = randomUUID();
    const workflow = new TestWorkflow({
      id,
      input: { start: 4 },
      repository,
    });

    await workflow.execute();

    expect(workflow.state).toMatchObject({
      id,
      status: "DONE",
      input: { start: 4 },
    });
    expect(workflow.state.stepResults.get("a")).toBe(5);
    expect(workflow.state.stepResults.get("b")).toBe(8);
    expect(workflow.state.stepResults.get("root")).toBe(13);
  });

  test("returns undefined when no root node has been built", async () => {
    class EmptyWorkflow extends GraphWorkflow<number, number> {
      constructor(params: { repository: WorkflowStateRepository }) {
        super({
          id: randomUUID(),
          name: "empty",
          input: 0,
          repository: params.repository,
        });
      }
    }

    const workflow = new EmptyWorkflow({
      repository: new InMemoryWorkflowStateRepository(),
    });

    const result = await workflow.execute();

    expect(result).toBeUndefined();
  });

  test("onChanges propagates to the root and its descendants", async () => {
    const repository = new InMemoryWorkflowStateRepository();
    const workflow = new TestWorkflow({
      id: randomUUID(),
      input: { start: 4 },
      repository,
    });

    const events: string[] = [];
    workflow.onChanges((event) => events.push(`${event.step}:${event.status}`));

    await workflow.execute();

    expect(events).toEqual(
      expect.arrayContaining([
        "a:START",
        "a:DONE",
        "b:START",
        "b:DONE",
        "root:START",
        "root:DONE",
      ]),
    );
  });

  test("getGraph returns the root node's tree", () => {
    const repository = new InMemoryWorkflowStateRepository();
    const workflow = new TestWorkflow({
      id: randomUUID(),
      input: { start: 4 },
      repository,
    });

    expect(workflow.getGraph()).toStrictEqual({
      name: "root",
      childs: [
        { name: "a", childs: [] },
        { name: "b", childs: [] },
      ],
    });
  });

  test("getGraph returns undefined when no root was built", () => {
    class EmptyWorkflow extends GraphWorkflow<number, number> {
      constructor(params: { repository: WorkflowStateRepository }) {
        super({
          id: randomUUID(),
          name: "empty",
          input: 0,
          repository: params.repository,
        });
      }
    }

    const workflow = new EmptyWorkflow({
      repository: new InMemoryWorkflowStateRepository(),
    });

    expect(workflow.getGraph()).toBeUndefined();
  });
});
