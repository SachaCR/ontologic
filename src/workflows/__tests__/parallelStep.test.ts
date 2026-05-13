import { randomUUID } from "node:crypto";

import { describe, test, expect, vi } from "vitest";
import { WorkflowBuilder } from "../";

describe("Workflow with parallel steps", () => {
  test("aggregates parallel handler outputs into a name-keyed record", async () => {
    const workflow = new WorkflowBuilder<number>({
      id: randomUUID(),
      name: "workflow",
      input: 4,
    }).addStepWithSubtasks({
      name: "parallel",
      subtasks: [
        { name: "increment", handler: async (n: number) => n + 1 },
        { name: "label", handler: async (n: number) => `n=${n}` },
      ],
    });

    const result = await workflow.execute();

    expect(result).toStrictEqual({ increment: 5, label: "n=4" });
  });

  test("runs parallel handlers concurrently", async () => {
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

    const workflow = new WorkflowBuilder<number>({
      id: randomUUID(),
      name: "workflow",
      input: 4,
    }).addStepWithSubtasks({
      name: "parallel",
      subtasks: [
        { name: "first", handler: first },
        { name: "second", handler: second },
      ],
    });

    const result = await workflow.execute();

    expect(result).toStrictEqual({ first: "first", second: "second" });
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  test("feeds the aggregated record into the next step", async () => {
    const workflow = new WorkflowBuilder<number>({
      id: randomUUID(),
      name: "workflow",
      input: 4,
    })
      .addStepWithSubtasks({
        name: "parallel",
        subtasks: [
          { name: "increment", handler: async (n: number) => n + 1 },
          { name: "label", handler: async (n: number) => `n=${n}` },
        ],
      })
      .addStep({
        name: "combine",
        handler: async (record) => `${record.label} (+1 = ${record.increment})`,
      });

    const result = await workflow.execute();

    expect(result).toBe("n=4 (+1 = 5)");
  });

  test("parallelizes after a regular step using its output as input", async () => {
    const workflow = new WorkflowBuilder<number>({
      id: randomUUID(),
      name: "workflow",
      input: 4,
    })
      .addStep({
        name: "double",
        handler: async (n) => n * 2,
      })
      .addStepWithSubtasks({
        name: "parallel",
        subtasks: [
          { name: "increment", handler: async (n: number) => n + 1 },
          { name: "label", handler: async (n: number) => `n=${n}` },
        ],
      });

    const result = await workflow.execute();

    expect(result).toStrictEqual({ increment: 9, label: "n=8" });
  });

  test("resumes from a cached parallel result without invoking the handlers", async () => {
    const increment = vi.fn(async (n: number) => n + 1);
    const label = vi.fn(async (n: number) => `n=${n}`);

    const stepResult = new Map<string, unknown>([
      ["parallel", { increment: 42, label: "cached" }],
    ]);

    const workflow = new WorkflowBuilder<number>({
      id: randomUUID(),
      name: "workflow",
      input: 4,
      stepResult,
    }).addStepWithSubtasks({
      name: "parallel",
      subtasks: [
        { name: "increment", handler: increment },
        { name: "label", handler: label },
      ],
    });

    const result = await workflow.execute();

    expect(result).toStrictEqual({ increment: 42, label: "cached" });
    expect(increment).not.toHaveBeenCalled();
    expect(label).not.toHaveBeenCalled();
  });

  test("wraps a failing parallel handler's error with the parallel step name", async () => {
    const original = new Error("boom");

    const workflow = new WorkflowBuilder<number>({
      id: randomUUID(),
      name: "workflow",
      input: 4,
    }).addStepWithSubtasks({
      name: "parallel",
      subtasks: [
        { name: "ok", handler: async (n: number) => n + 1 },
        { name: "fails", handler: () => Promise.reject(original) },
      ],
    });

    await expect(workflow.execute()).rejects.toMatchObject({
      message: expect.stringMatching(/parallel/),
      cause: original,
    });
  });
});
