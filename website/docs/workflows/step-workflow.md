---
sidebar_position: 2
---

# Step workflow

Use the step flavor when your process is essentially a chain: each step depends on the previous one's output, and the order is sequential. Steps are added one after the other with `addStep`, and the type system enforces that the output of step N matches the input of step N+1.

The shared semantics — state, persistence, observability via `onChanges`, and structured failure handling — are described on the [Workflows introduction](./index.md). This page focuses on the step-specific API.

---

## Building a chain

A workflow starts from an input and threads it through a series of typed steps:

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

const workflow = new WorkflowBuilder<SepaPaymentRequest>({
  id: randomUUID(),
  name: "SEPA Payment",
  input: { accountId: "ACC-001", receiverIban: "...", amount: 250 },
})
  .addStep(checkAccountBalance)
  .addStep(checkReceiverIsValid);

const result = await workflow.execute();
```

The chain is type-checked end-to-end: `checkReceiverIsValid` expects `SepaPaymentRequest`, so it can only be added after a step that produces it. Reordering is a compile error, not a runtime surprise.

---

## Parallel subtasks inside a step

When a step needs to fan out into N independent subtasks and aggregate their results, use `addStepWithSubtasks`. Subtasks run concurrently; the step's output is a record keyed by subtask name:

```typescript
const workflow = new WorkflowBuilder<SepaPaymentRequest>({
  id: randomUUID(),
  name: "SEPA Payment",
  input: { accountId: "ACC-001", receiverIban: "...", amount: 250 },
})
  .addStepWithSubtasks({
    name: "Compliance Checks",
    subtasks: [
      {
        name: "amlCheck",
        handler: async (req) => ({ amlScore: 0.12, cleared: true }),
      },
      {
        name: "kycCheck",
        handler: async (req) => ({ kycCleared: true }),
      },
    ],
  })
  .addStep({
    name: "Decision",
    handler: async (input) =>
      input.amlCheck.cleared && input.kycCheck.kycCleared,
  });
```

The next step receives `{ amlCheck: { amlScore: number; cleared: boolean }; kycCheck: { kycCleared: boolean } }` — the type system tracks each subtask's specific output by its name.

If you need to capture a subtask's name as a precise string literal (for instance when storing them in a variable before passing to `subtasks`), use the `defineSubTask` helper:

```typescript
import { defineSubTask } from "ontologic";

const amlCheck = defineSubTask({
  name: "amlCheck",
  handler: async (req: SepaPaymentRequest) => ({ cleared: true }),
});
```

---

## Persisting and resuming

Pass a `WorkflowStateRepository` to `execute()` and the state is saved before the first step and after the last one (whether it succeeded or failed):

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

A workflow that crashed at step 4 of 5 will, on resume, fast-forward through steps 1–3 and only re-run from step 4. The same caching rule applies inside `addStepWithSubtasks`: a subtask-bearing step whose aggregated result is already in `stepResults` is skipped wholesale.

---

## Summary

| Concept                       | Purpose                                                      |
| ----------------------------- | ------------------------------------------------------------ |
| `WorkflowBuilder`             | Init a step-based workflow from an input                     |
| `WorkflowStep<Input, Output>` | A named, typed handler in the chain                          |
| `addStep(...)`                | Type-checked sequential composition                          |
| `addStepWithSubtasks(...)`    | Fan out to N concurrent subtasks; aggregate by name          |
| `defineSubTask(...)`          | Helper that captures a subtask's name as a string literal    |
| `stepResult` constructor arg  | Resume from a previous run by feeding cached results back in |
| `execute(repository?)`        | Run the chain; optionally persist initial and final state    |
