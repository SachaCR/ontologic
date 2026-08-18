import { randomUUID } from "node:crypto";

import { describe, test, expect, vi } from "vitest";
import { WorkflowBuilder, WorkflowStep } from "../";

describe("Workflow", () => {
  test("executes a chain of steps using the workflow input", async () => {
    const step1: WorkflowStep<number, number> = {
      name: "Step 1",
      handler: (count) => Promise.resolve(count + 5),
    };

    const step2: WorkflowStep<number, string> = {
      name: "Step 2",
      handler: (sum) => Promise.resolve(`toto: ${sum}`),
    };

    const workflowBuilder = new WorkflowBuilder<number>({
      id: randomUUID(),
      name: "workflow",
      input: 4,
    });

    const workflow = workflowBuilder.addStep(step1).addStep(step2);

    const result = await workflow.execute();

    expect(result).toBe("toto: 9");
    expect(
      Array.from(workflow.results().entries(), ([key, value]) => ({
        key,
        value,
      })),
    ).toStrictEqual([
      { key: "Step 1", value: 9 },
      { key: "Step 2", value: "toto: 9" },
    ]);
  });

  test("resumes from a pre-populated stepResult map without re-running cached steps", async () => {
    const handler1 = vi.fn((count: number) => Promise.resolve(count + 5));
    const handler2 = vi.fn((sum: number) => Promise.resolve(`toto: ${sum}`));

    const stepResult = new Map<string, unknown>([["Step 1", 42]]);

    const workflow = new WorkflowBuilder<number>({
      id: randomUUID(),
      name: "workflow",
      input: 4,
      stepResult,
    })
      .addStep({ name: "Step 1", handler: handler1 })
      .addStep({ name: "Step 2", handler: handler2 });

    const result = await workflow.execute();

    expect(result).toBe("toto: 42");
    expect(handler1).not.toHaveBeenCalled();
    expect(handler2).toHaveBeenCalledTimes(1);
  });

  test("wraps a failing step's error with the step name and preserves the cause", async () => {
    const original = new Error("boom");

    const failingStep: WorkflowStep<number, number> = {
      name: "Failing Step",
      handler: () => Promise.reject(original),
    };

    const workflow = new WorkflowBuilder<number>({
      id: randomUUID(),
      name: "workflow",
      input: 4,
    }).addStep(failingStep);

    await expect(workflow.execute()).rejects.toMatchObject({
      message: expect.stringMatching(/Failing Step/),
      cause: original,
    });
  });

  test("saves the full workflow state before and after executing a step", async () => {
    const id = randomUUID();
    const snapshots: unknown[] = [];
    const save = vi.fn(async (state: unknown) => {
      snapshots.push(structuredClone(state));
    });

    const workflow = new WorkflowBuilder<number>({
      id,
      name: "workflow",
      input: 4,
    }).addStep({
      name: "Step 1",
      handler: (count) => Promise.resolve(count + 5),
    });

    await workflow.execute({ save });

    expect(save).toHaveBeenCalledTimes(2);
    expect(snapshots[0]).toStrictEqual({
      id,
      name: "workflow",
      input: 4,
      stepResults: new Map(),
      error: undefined,
      status: "IN_PROGRESS",
    });
    expect(snapshots[1]).toStrictEqual({
      id,
      name: "workflow",
      input: 4,
      stepResults: new Map([["Step 1", 9]]),
      error: undefined,
      status: "DONE",
    });
  });

  test("saves the full workflow state with the error populated when a step fails", async () => {
    const id = randomUUID();
    const snapshots: unknown[] = [];
    const save = vi.fn(async (state: unknown) => {
      snapshots.push(structuredClone(state));
    });

    const workflow = new WorkflowBuilder<number>({
      id,
      name: "workflow",
      input: 4,
    }).addStep({
      name: "Failing Step",
      handler: () => Promise.reject(new Error("boom")),
    });

    await expect(workflow.execute({ save })).rejects.toThrow(/Failing Step/);

    expect(save).toHaveBeenCalledTimes(2);
    expect(snapshots[0]).toStrictEqual({
      id,
      name: "workflow",
      input: 4,
      stepResults: new Map(),
      error: undefined,
      status: "IN_PROGRESS",
    });
    expect(snapshots[1]).toStrictEqual({
      id,
      name: "workflow",
      input: 4,
      stepResults: new Map(),
      error: {
        step: "Failing Step",
        error: "Step: Failing Step failed with: Error boom",
        name: "Error",
      },
      status: "FAILED",
    });
  });
});
