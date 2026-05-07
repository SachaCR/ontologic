---
sidebar_position: 7
---

# Workflows

Some business operations cannot fit in a single method. A SEPA payment is not just a database write it is a sequence: check the balance, validate the receiver, run an AML screen, reserve the funds, then create the transfer. Each step depends on the previous one, each one can fail, and a crash in the middle must not corrupt the system.

A **Workflow** is a typed, resumable pipeline for this kind of multi-step process. It keeps the steps composable, the state observable, and the failure modes explicit.

---

## Why not just chain async functions?

Plain `await` chains work for two or three steps. They start to creak when:

- A step fails halfway through, and you need to know **which** one and **why** without parsing stack traces.
- The process must be **resumable** after a crash, picking up at the step that didn't finish.
- The intermediate values are useful for **observability**, auditing, debugging, business reporting.
- Each step has a **different input shape**, and you want the type system to enforce the order.

`ontologic`'s `WorkflowBuilder` gives you all of that without forcing a heavy framework. Steps are plain functions, the chain is type-checked end to end, and the state is a plain object you can persist anywhere.

---

## Building a workflow

A workflow starts from an input and threads it through a series of steps. Each step takes the previous step's output and returns its own:

```typescript
import { WorkflowBuilder, WorkflowStep } from "ontologic";

interface SepaPaymentRequest {
  accountId: string;
  receiverIban: string;
  amount: number;
}

const checkAccountBalance: WorkflowStep<
  SepaPaymentRequest,
  SepaPaymentRequest
> = {
  name: "Check Account Balance",
  handler: async (request) => {
    if (request.amount > 3000) {
      throw new Error("Not enough funds");
    }
    return request;
  },
};

const checkReceiverIsValid: WorkflowStep<
  SepaPaymentRequest,
  SepaPaymentRequest & { receiverName: string }
> = {
  name: "Check Receiver Is Valid",
  handler: async (request) => ({
    ...request,
    receiverName: "John Doe",
  }),
};
```

The chain is type-checked: `checkReceiverIsValid` expects `SepaPaymentRequest`, so it can only be added after a step that produces it. Reordering the chain is a compile error, not a runtime surprise.

```typescript
const workflow = new WorkflowBuilder<SepaPaymentRequest>({
  id: randomUUID(),
  name: "SEPA Payment",
  input: { accountId: "ACC-001", receiverIban: "...", amount: 250 },
})
  .addStep(checkAccountBalance)
  .addStep(checkReceiverIsValid);

const result = await workflow.execute();
```

---

## Workflow state

Every workflow carries a `WorkflowState` that is updated as steps run:

| Field         | What it holds                                              |
| ------------- | ---------------------------------------------------------- |
| `id`          | Stable identifier for this workflow run                    |
| `name`        | Human-readable name                                        |
| `input`       | The original input                                         |
| `stepResults` | A `Map<string, unknown>` of step name → step output        |
| `error`       | The step that failed and the wrapped error message, if any |
| `status`      | `TODO` → `IN_PROGRESS` → `DONE`, or `FAILED`               |

This state is the source of truth for **what has happened so far**. You can inspect it at any point, and if you provide a repository `ontologic` will persist it for you.

---

## Persisting and resuming with a repository

The optional `WorkflowStateRepository` is called before the first step and after the last step (whether it succeeded or failed):

```typescript
import { InMemoryWorkflowStateRepository } from "ontologic";

const repository = new InMemoryWorkflowStateRepository();
await workflow.execute(repository);

// Later, after a crash, fetch the state and resume
const state = await repository.getById(workflowId);
const resumed = new WorkflowBuilder({
  id: state.id,
  name: state.name,
  input: state.input,
  stepResult: state.stepResults, // pre-populated cache
})
  .addStep(checkAccountBalance)
  .addStep(checkReceiverIsValid);

await resumed.execute(repository);
```

When a step's name already exists in `stepResults`, the workflow skips its handler and reuses the cached output. A workflow that crashed at step 4 of 5 will, on resume, fast-forward through steps 1–3 and only re-run from step 4.

Swap `InMemoryWorkflowStateRepository` for any implementation of `WorkflowStateRepository` Postgres, MongoDB, etc... and the rest of your workflow code stays unchanged.

---

## Failures are first-class

When a step's handler throws, `ontologic`:

1. Wraps the error with the step name and the original error as `cause`.
2. Sets `state.error` to `{ step, error, name }` so the failure is visible in the persisted state.
3. Marks `state.status` as `FAILED`.
4. Saves the state once more before re-throwing, so a crash right after the failure still leaves a record.

The wrapped error rethrows out of `execute()`. Catch it at the boundary you care about:

```typescript
try {
  await workflow.execute(repository);
} catch (err) {
  // err.message contains the step name
  // err.cause is the original error from the handler
}
```

For domain-meaningful cancellations (a balance too low, a receiver flagged as fraudulent), throw a `DomainError` from inside the handler rather than a plain `Error`. The same wrapping applies, and the structured context survives in `error.cause`.

Then it's up to you to decide which error deserves to be retried or not.

---

## Summary

| Concept                         | Purpose                                                                 |
| ------------------------------- | ----------------------------------------------------------------------- |
| `WorkflowBuilder`               | Init a workflow from an input                                           |
| `WorkflowStep<Input, Output>`   | A named, typed handler in the chain                                     |
| `addStep(...)`                  | Type-checked composition; output of step N must match input of step N+1 |
| `WorkflowState`                 | Observable, serializable record of progress                             |
| `WorkflowStateRepository`       | Pluggable persistence, save initial, save after last step               |
| `stepResult` constructor option | Resume from a previous run by feeding cached results back in            |

A workflow is just a chain of typed functions plus a state object. The discipline it imposes: explicit steps, observable state, structured failures, is what makes it safe to run business processes that span multiple I/O calls.
