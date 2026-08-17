---
sidebar_position: 3
---

# Graph workflow

Use the graph flavor when the dependencies between steps form a tree (or DAG) rather than a line: a node has _named_ children, runs them concurrently, and receives a record of their outputs as its input. The dependency structure lives in the code rather than in a procedural chain.

The shared semantics — state, persistence, observability via `onChanges`, and structured failure handling — are described on the [Workflows introduction](./index.md). This page focuses on the graph-specific API.

---

## Building a graph

A graph workflow is a subclass of `GraphWorkflow` that constructs its root `WorkflowNode` in `build(...)`. Each node declares its children as a record: a string key plus the child node wired into that slot.

```typescript
import {
  GraphWorkflow,
  WorkflowNode,
  InMemoryWorkflowStateRepository,
  WorkflowStateRepository,
} from "ontologic";

interface MyInputs {
  url: string;
  data: number[];
  name: string;
}

class MyWorkflow extends GraphWorkflow<MyInputs, string> {
  constructor(params: {
    id: string;
    input: MyInputs;
    repository?: WorkflowStateRepository;
  }) {
    super({
      ...params,
      name: "My Workflow",
      repository: params.repository ?? new InMemoryWorkflowStateRepository(),
    });
    this.build((input) => this.#root(input));
  }

  #root(input: MyInputs) {
    const dataSource = new WorkflowNode({
      name: "Data Source",
      children: {},
      handler: async () => ({ data: input.data }),
    });

    const nameSource = new WorkflowNode({
      name: "Name Source",
      children: {},
      handler: async () => ({ name: input.name }),
    });

    const summed = new WorkflowNode({
      name: "Sum",
      children: { source: dataSource },
      handler: async ({ source }) => ({
        sum: source.data.reduce((s, c) => s + c),
      }),
    });

    return new WorkflowNode({
      name: "Combine",
      children: { total: summed, tag: nameSource },
      handler: async ({ total, tag }) => `${tag.name} = ${total.sum}`,
    });
  }
}

const workflow = new MyWorkflow({
  id: randomUUID(),
  input: { url: "...", data: [1, 2, 3, 4, 5], name: "Sacha" },
});

const result = await workflow.execute();
```

The handler of `Combine` receives `{ total, tag }` automatically typed as `{ total: { sum: number }; tag: { name: string } }` — the type system follows the graph. Children of the same node run concurrently via `Promise.all`. A node with `children: {}` is a leaf: it produces a value without depending on anything below it.

---

## Visualizing the graph

`GraphWorkflow.getGraph()` returns a `Graph` — a plain tree of `{ name, status, childs }` — whose `toString()` renders it as ASCII, useful for debugging or shipping into logs:

```typescript
console.log(workflow.getGraph().toString());
```

```
Combine
├── total: Sum
│   └── source: Data Source
└── tag: Name Source
```

Each line names a node; the prefix (`├──`, `└──`, `│`) reflects the position of that child among its siblings, and indentation shows depth.

`toString()` accepts a `RenderTreeOptions` object:

| Option          | Default  | Effect                                              |
| --------------- | -------- | --------------------------------------------------- |
| `indent`        | `4`      | Characters between sibling columns (minimum 2)      |
| `verticalSpace` | `true`   | Adds a skeleton row before each child               |
| `style`         | `"thin"` | Glyph set — `"thin"` (`├─`) or `"heavy"` (`┣━`)     |
| `color`         | `false`  | Colorize node names by status using ANSI escapes    |

```typescript
console.log(workflow.getGraph().toString({ style: "heavy", color: true }));
```

With `color: true`, nodes are gray when `TODO`, orange when `IN_PROGRESS`, green when `DONE`, and red when `FAILED` — so calling it from inside an `onChanges` handler gives you a live progress tree in the terminal.

---

## Observability and persistence

Subscribe to step transitions before calling `execute()`:

```typescript
workflow.onChanges((event) => {
  // event =
  //   | { step: string; status: "IN_PROGRESS" }
  //   | { step: string; status: "DONE" }
  //   | { step: string; status: "FAILED"; error: Error }
});
```

The repository passed to the `GraphWorkflow` constructor is saved after `execute()` completes. Resumability works the same way as the step flavor: a node whose name is already a key in `stepResults` skips its handler and reuses the cached output.

For the full description of state, repository plumbing, and failure handling — all shared between both flavors — see the [Workflows introduction](./index.md).

---

## Summary

| Concept                    | Purpose                                                        |
| -------------------------- | -------------------------------------------------------------- |
| `GraphWorkflow` (subclass) | DAG-shaped workflow; constructs its root in `build(...)`       |
| `WorkflowNode`             | Node with named children, runs them in parallel                |
| `children: {}`             | Marks a leaf node — produces a value with no dependencies      |
| `children: { key: node }`  | Wires `node` into the `key` slot of the handler input          |
| `getGraph()`               | Returns the `Graph` tree; `.toString(opts)` renders it as ASCII |
| `setContext(state)`        | Shares the workflow state through the tree (called by `build`) |
| `onChanges(...)`           | Subscribe to `IN_PROGRESS` / `DONE` / `FAILED` events on any node |
