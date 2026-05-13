---
sidebar_position: 1
---

# Workflows

:::warning
This part of the documentation has been AI generated and I haven't reviewed it yet. So please be kind if you find mistakes or inconsistencies. I'll remove this warning once I've reviewed this page.
:::

Some business operations cannot fit in a single method. A SEPA payment is not just a database write — it is a sequence: check the balance, validate the receiver, run an AML screen, reserve the funds, then create the transfer. Other processes look less like a chain and more like a graph: pull user data and order data and inventory data in parallel, then combine the three into a single decision.

`ontologic` ships two flavors of workflow for these two shapes:

- **[Step workflow](./step-workflow.md)** — a typed, linear chain where each step's output feeds the next. Built with `WorkflowBuilder`. Optionally fans out to a fixed set of concurrent subtasks at any point in the chain.
- **[Graph workflow](./graph-workflow.md)** — a DAG of nodes where each node has named children, runs them concurrently, and receives a record of their outputs as its input. Built with `WorkflowNode` and `GraphWorkflow`.

Both share the same core promises:

- **Observability** — subscribe to step-by-step progress via `onChanges`.
- **Persistence** — workflow state lives in a `WorkflowState` object saved through any `WorkflowStateRepository`.
- **Resumability** — a re-run skips any step whose result is already cached in the state, so a crashed run picks up exactly where it stopped.
- **Failure handling** — when a step throws, the error is wrapped with the step's name and the original error is preserved as `cause`.

---

## Why not just chain async functions?

Plain `await` chains work for two or three steps. They start to creak when:

- A step fails halfway through, and you need to know **which** one and **why** without parsing stack traces.
- The process must be **resumable** after a crash, picking up at the step that didn't finish.
- The intermediate values are useful for **observability**: auditing, debugging, business reporting.
- Each step has a **different input shape**, and you want the type system to enforce the order.
- Steps run **in parallel** and you want the type system to track which result came from where.

Both workflow flavors give you all of that without forcing a heavy framework. Steps are plain functions, the chain or graph is type-checked end to end, and the state is a plain object you can persist anywhere.

---

## Shared state

Both flavors thread the same state object through every step:

| Field         | What it holds                                              |
| ------------- | ---------------------------------------------------------- |
| `id`          | Stable identifier for this workflow run                    |
| `name`        | Human-readable name                                        |
| `input`       | The original input                                         |
| `stepResults` | A `Map<string, unknown>` of step name → step output        |
| `error`       | The step that failed and the wrapped error message, if any |
| `status`      | `TODO` → `IN_PROGRESS` → `DONE`, or `FAILED`               |

`stepResults` is the source of truth for **what has finished so far**. It is also the mechanism behind resumability: if a step's name is already a key in `stepResults`, both flavors skip its handler and reuse the cached output.

A `WorkflowStateRepository` is the pluggable persistence interface — `save` and `getById`. `ontologic` ships `InMemoryWorkflowStateRepository` for tests and local prototyping; swap it for Postgres, MongoDB, or anything else, and the rest of your workflow code is unchanged.

---

## Observability — `onChanges`

Both flavors expose an `onChanges` callback that fires as steps transition:

```typescript
workflow.onChanges((event) => {
  // step flavor:  { step, status: "DONE" | "FAILED" }
  // graph flavor: { step, status: "START" | "DONE" | "FAILED", result?, error? }
});
```

Use it for logging, progress UIs, metrics, or audit trails. Subscribe before calling `execute()`.

---

## Failures are first-class

When any step's handler throws, both flavors:

1. Wrap the error with the step's name and the original error as `cause`.
2. Set `state.error` to `{ step, error, name }` so the failure is visible in the persisted state.
3. Mark `state.status` as `FAILED`.
4. Emit a `FAILED` event through `onChanges`.

```typescript
try {
  await workflow.execute(repository);
} catch (err) {
  // err.message contains the step name
  // err.cause is the original error from the handler
}
```

For domain-meaningful cancellations (a balance too low, a receiver flagged as fraudulent), throw a `DomainError` from inside the handler rather than a plain `Error`. The same wrapping applies, and the structured context survives in `error.cause`. From there, your code decides which failures deserve a retry and on what schedule.

---

## Choosing between step and graph

| Question                                               | Use this                     |
| ------------------------------------------------------ | ---------------------------- |
| Each step depends on exactly one prior step's output   | Step                         |
| A step occasionally fans out to a fixed set of N tasks | Step + `addStepWithSubtasks` |
| Dependencies form a tree or DAG with branching         | Graph                        |
| You want to name and reference inputs by child node    | Graph                        |
| Linear pipeline, no fan-out                            | Step                         |

If your process reads naturally as _"do A, then B, then C"_, the [step flavor](./step-workflow.md) matches that shape. If it reads as _"D depends on B and C, which both depend on A"_, the [graph flavor](./graph-workflow.md) lets the dependency structure live in the code rather than in your head.
