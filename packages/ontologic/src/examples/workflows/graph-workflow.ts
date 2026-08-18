import {
  GraphWorkflow,
  InMemoryWorkflowStateRepository,
  WorkflowNode,
  WorkflowStateRepository,
} from "../../workflows";

interface MyWorkflowInputs {
  url: string;
  greeting: string;
  data: number[];
  name: string;
}

class MyWorkflow extends GraphWorkflow<MyWorkflowInputs, string> {
  constructor(params: {
    id: string;
    input: MyWorkflowInputs;
    repository?: WorkflowStateRepository;
    stepResults?: Map<string, unknown>;
  }) {
    const repo = params.repository
      ? params.repository
      : new InMemoryWorkflowStateRepository();

    super({ ...params, name: "My Workflow", repository: repo });

    this.build(this.#buildWorkflow);
  }

  #buildWorkflow(inputs: MyWorkflowInputs) {
    const dataSource = new WorkflowNode({
      name: "Data Source",
      children: {},
      handler: async () => {
        await sleep(2000);
        inputs.url;
        return Promise.resolve({ data: inputs.data });
      },
    });

    const nameSource = new WorkflowNode({
      name: "Name Source",
      children: {},
      handler: async () => {
        await sleep(500);
        return Promise.resolve({ name: inputs.name });
      },
    });

    const summed = new WorkflowNode({
      name: "Sum",
      children: { source: dataSource },
      handler: async (input) => {
        await sleep(2000);
        return Promise.resolve({
          sum: input.source.data.reduce((s, c) => s + c),
        });
      },
    });

    const combined = new WorkflowNode({
      name: "Combine",
      children: { total: summed, tag: nameSource },
      handler: async (input) => {
        await sleep(2000);
        return Promise.resolve({
          message: `${input.tag.name} = ${input.total.sum}`,
        });
      },
    });

    const hello = new WorkflowNode({
      name: "Hello",
      children: {},
      handler: async () => {
        await sleep(1000);
        return Promise.resolve({
          message: inputs.greeting,
        });
      },
    });

    const uppercase = new WorkflowNode({
      name: "Uppercase",
      children: { combined, hello },
      handler: async (input): Promise<string> => {
        await sleep(2000);
        return Promise.resolve(
          input.hello.message.toUpperCase() +
            " " +
            input.combined.message.toUpperCase(),
        );
      },
    });

    return uppercase;
  }
}

async function run() {
  const repository = new InMemoryWorkflowStateRepository();

  const myWorkflow = new MyWorkflow({
    id: "123",
    input: {
      url: "https://ontologic.site",
      greeting: "Hello",
      data: [1, 2, 3, 4, 5],
      name: "Sacha",
    },
    repository,
  });

  myWorkflow.onChanges(() => {
    // Clear screen + move cursor to home so the tree redraws in place.
    process.stdout.write("\x1b[2J\x1b[H");
    const graph = myWorkflow.getGraph();

    console.log(graph.toString({ style: "thin", color: true }));
  });

  const result = await myWorkflow.execute();

  console.log("RESULT:", result);
  console.log(await repository.getById("123"));

  // Simulate a retry
  const previousRunResults = myWorkflow.state.stepResults;
  const previousRunInputs = myWorkflow.state.input;

  const myWorkflowRetry = new MyWorkflow({
    id: "123",
    stepResults: previousRunResults, // Pass previous run results
    input: previousRunInputs, // Pass previoud run inputs
    repository,
  });

  myWorkflowRetry.onChanges(() => {
    // Clear screen + move cursor to home so the tree redraws in place.
    process.stdout.write("\x1b[2J\x1b[H");
    const graph = myWorkflowRetry.getGraph();

    console.log(graph.toString({ style: "heavy", color: true }));
  });

  console.log("WILL RETRY IN 3 scd");
  await sleep(3000);

  const result2 = await myWorkflowRetry.execute();

  console.log("RESULT 2:", result2);
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

run().catch(console.error);
