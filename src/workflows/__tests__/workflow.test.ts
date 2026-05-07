import { describe, test, expect } from "vitest";
import { Workflow, WorkflowStep } from "../";

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

    const workflow = new Workflow<number>({
      name: "workflow",
      input: 4,
    });

    const result = await workflow.addStep(step1).addStep(step2).execute();

    expect(result).toBe("toto: 9");
    expect(
      workflow
        .results()
        .entries()
        .map((val) => {
          return { key: val[0], value: val[1] };
        })
        .toArray(),
    ).toStrictEqual([
      { key: "Step 1", value: 9 },
      { key: "Step 2", value: "toto: 9" },
    ]);
  });
});
