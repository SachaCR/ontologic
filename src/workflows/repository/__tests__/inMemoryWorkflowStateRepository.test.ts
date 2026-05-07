import { randomUUID } from "node:crypto";

import { describe, test, expect } from "vitest";
import { InMemoryWorkflowStateRepository } from "../inMemoryWorkflowStateRepository";
import { WorkflowState } from "../../workflow";

function makeState(
  overrides: Partial<WorkflowState<unknown>> = {},
): WorkflowState<unknown> {
  return {
    id: randomUUID(),
    name: "workflow",
    input: 4,
    stepResults: new Map<string, unknown>(),
    error: undefined,
    ...overrides,
  };
}

describe("InMemoryWorkflowStateRepository", () => {
  test("returns the saved state by id", async () => {
    const repository = new InMemoryWorkflowStateRepository();
    const state = makeState({
      stepResults: new Map<string, unknown>([["Step 1", 9]]),
    });

    await repository.save(state);
    const loaded = await repository.getById(state.id);

    expect(loaded).toStrictEqual(state);
  });

  test("returns undefined for an unknown id", async () => {
    const repository = new InMemoryWorkflowStateRepository();

    const loaded = await repository.getById(randomUUID());

    expect(loaded).toBeUndefined();
  });

  test("isolates the stored state from later mutations of the original", async () => {
    const repository = new InMemoryWorkflowStateRepository();
    const state = makeState();

    await repository.save(state);
    state.stepResults.set("Step 1", 9);
    state.error = { step: "Step 1", error: "boom" };

    const loaded = await repository.getById(state.id);

    expect(loaded?.stepResults).toStrictEqual(new Map());
    expect(loaded?.error).toBeUndefined();
  });

  test("returns a fresh copy so callers cannot mutate the stored state", async () => {
    const repository = new InMemoryWorkflowStateRepository();
    const state = makeState();

    await repository.save(state);

    const first = await repository.getById(state.id);
    first!.stepResults.set("Step 1", 9);

    const second = await repository.getById(state.id);
    expect(second?.stepResults).toStrictEqual(new Map());
  });
});
