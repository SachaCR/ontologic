---
name: ontologic-workflows
description: Build multi-step or branching business processes with `ontologic` workflows — linear step chains via WorkflowBuilder, or DAGs via GraphWorkflow and WorkflowNode, with state persistence, resumability after a crash, and progress observability through onChanges. Use when a process spans several steps, needs to resume where it stopped, or fans out into concurrent work.
---

# Ontologic — workflows

Two flavors for two shapes of process. Both persist their state, resume where they
stopped, and report progress through `onChanges`.

## Choosing

| The process reads as… | Use |
|---|---|
| "do A, then B, then C" — each step consumes the previous output | **Step** (`WorkflowBuilder`) |
| A linear chain that occasionally fans out to a fixed set of tasks | **Step** + `addStepWithSubtasks` |
| "D depends on B and C, which both depend on A" | **Graph** (`GraphWorkflow` + `WorkflowNode`) |

If the dependency structure would otherwise live in your head, use the graph.

## Shared machinery

State threaded through every step: `{ id, name, input, stepResults, error, status }`,
where `status` is `TODO → IN_PROGRESS → DONE`, or `FAILED`.

**`stepResults` is the resumability mechanism.** It is a `Map<string, unknown>` keyed by
step name. If a step's name is already a key, its handler is skipped and the cached value
is reused. To retry a crashed run, construct a new workflow with the previous run's
`stepResults` and `input`.

Persistence goes through `WorkflowStateRepository` (`save` / `getById`).
`InMemoryWorkflowStateRepository` ships for tests and prototyping.

## Graph workflow

Subclass `GraphWorkflow<Input, Output>` and call `this.build(...)` from the constructor
with a function returning the **root** node:

```typescript
class MyWorkflow extends GraphWorkflow<MyInputs, string> {
  constructor(params: {
    id: string;
    input: MyInputs;
    repository?: WorkflowStateRepository;
    stepResults?: Map<string, unknown>;
  }) {
    super({
      ...params,
      name: "My Workflow",
      repository: params.repository ?? new InMemoryWorkflowStateRepository(),
    });

    this.build(this.#buildWorkflow);
  }

  #buildWorkflow(inputs: MyInputs) {
    const source = new WorkflowNode({
      name: "Data Source",
      children: {},                       // {} means leaf
      handler: async () => ({ data: inputs.data }),
    });

    const summed = new WorkflowNode({
      name: "Sum",
      children: { source },               // slot name → node
      handler: async (input) => ({
        sum: input.source.data.reduce((s, c) => s + c, 0),
      }),
    });

    return summed;                        // the ROOT node
  }
}
```

A node's handler receives `{ [slotName]: childOutput }`, fully typed from the graph.
Children of the same node run concurrently via `Promise.all`.

Render the tree with `workflow.getGraph().toString({ style: "heavy", color: true })` —
options are `indent`, `verticalSpace`, `style` (`"thin"` | `"heavy"`), `color`.

## Observability

Subscribe **before** calling `execute()`:

```typescript
workflow.onChanges((event) => {
  // { step, status: "IN_PROGRESS" }
  // { step, status: "DONE" }
  // { step, status: "FAILED", error: Error }
});
```

## Failures

A throwing handler is wrapped as `new Error("Step: <name> failed with: ...", { cause: original })`,
`state.error` is set to `{ step, error, name }`, `state.status` becomes `FAILED`, a
`FAILED` event is emitted, and the error is rethrown. Throw a `DomainError` from inside a
handler for domain-meaningful cancellations — the structured context survives in `cause`.

## Traps

- `toTree()` does not exist. It is `getGraph().toString(opts)`.
- The status is `"IN_PROGRESS"`, not `"START"` — in both flavors, and for the parallel
  subtasks of `addStepWithSubtasks` too.
- `this.build(...)` must be called in the constructor, after `super(...)`.
- The builder function returns the **root** node, not an array of nodes.
- Subscribing to `onChanges` after `execute()` misses the events.

## Deeper references

- Step workflows: `WorkflowBuilder`, `addStep`, `addStepWithSubtasks`, `defineSubTask` —
  <https://ontologic.site/docs/workflows/step-workflow>
- Graph workflows: node typing, rendering, retries —
  <https://ontologic.site/docs/workflows/graph-workflow>
- Shared state, persistence, failure handling —
  <https://ontologic.site/docs/workflows>
- Everything in one file — <https://ontologic.site/llms-full.txt>

Runnable examples in the library repo: `src/examples/workflows/graph-workflow.ts` and
`src/examples/workflows/step-workflow-sepaPayment.ts`.
