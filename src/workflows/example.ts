import { Workflow, WorkflowStep } from "./";

const step1: WorkflowStep<number, number> = {
  handler: (count: number) => Promise.resolve(count + 5),
  name: "Step 1",
};

const step2: WorkflowStep<number, string> = {
  name: "Step 2",
  handler: (sum: number) => {
    return Promise.resolve(`toto: ${sum}`);
  },
};

async function start() {
  const workflow = new Workflow<number>({
    name: "workflow",
    input: 4,
  });

  const result = await workflow.addStep(step1).addStep(step2).execute();
  console.log(result);
}

start().catch(console.error);
