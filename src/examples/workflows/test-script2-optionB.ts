import { WorkflowStateRepository } from "../../workflows";

type ChildrenOutputs<C extends Record<string, WorkflowNode<any, any>>> = {
  [K in keyof C]: C[K] extends WorkflowNode<any, infer O> ? O : never;
};

interface WorkflowContext {
  stepResults: Map<string, unknown>;
  error: Error | undefined;
}

export class Workflow<Input, Output> {
  #name: string;
  #input: Input;
  #repository: WorkflowStateRepository;
  #rootNode: WorkflowNode<any, Output> | undefined;
  #context: WorkflowContext;

  constructor(params: {
    input: Input;
    name: string;
    repository: WorkflowStateRepository;
  }) {
    const { name, input, repository } = params;
    this.#name = name;
    this.#repository = repository;
    this.#input = input;
    this.#context = {
      stepResults: new Map<string, unknown>(),
      error: undefined,
    };
  }

  get context(): WorkflowContext {
    return this.#context;
  }

  build(builder: (input: Input) => WorkflowNode<any, Output>): void {
    this.#rootNode = builder(this.#input);

    this.#rootNode.setContext(this.#context);

    this.#rootNode.onChanges((event) => {
      switch (event.status) {
        case "DONE":
          console.log({ step: event.step, status: event.status });
          break;

        case "FAILED":
          console.log({ step: event.step, status: event.status });
          break;

        case "START":
          console.log(event);
          break;
      }
    });
  }

  async execute() {
    if (!this.#rootNode) {
      return;
    }

    const output = await this.#rootNode.execute();
    await this.#repository.save({
      id: "",
      name: this.name,
      input: this.#input,
      stepResults: this.#context.stepResults,
      error: {
        step: this.name,
        name: this.#context.error?.name || "",
        error: this.#context.error?.message || "",
      },
      status: "DONE",
    });
    return output;
  }

  get name(): string {
    return this.#name;
  }
}

export class WorkflowNode<
  Children extends Record<string, WorkflowNode<any, any>>,
  Output,
> {
  #name: string;
  #children: Children;
  #handler: (input: ChildrenOutputs<Children>) => Promise<Output>;
  #context: WorkflowContext;

  #onChanges: (
    event:
      | { step: string; status: "START" }
      | { step: string; status: "DONE"; result: Output }
      | { step: string; status: "FAILED"; error: Error },
  ) => void;

  constructor(params: {
    name: string;
    children: Children;
    handler: (input: ChildrenOutputs<Children>) => Promise<Output>;
  }) {
    this.#name = params.name;
    this.#children = params.children;
    this.#handler = params.handler;
    this.#onChanges = () => {};
    this.#context = {
      stepResults: new Map<string, unknown>(),
      error: undefined,
    };
  }

  onChanges(
    handler: (
      event:
        | { step: string; status: "START" }
        | { step: string; status: "DONE"; result: Output }
        | { step: string; status: "FAILED"; error: Error },
    ) => void,
  ) {
    this.#onChanges = handler;

    Object.entries(this.#children).map(async ([_name, child]) => {
      child.onChanges(this.#onChanges);
    });
  }

  setContext(context: WorkflowContext): void {
    this.#context = context;

    Object.entries(this.#children).map(async ([_name, child]) => {
      child.setContext(this.#context);
    });
  }

  async execute(): Promise<Output> {
    if (this.#context.stepResults.has(this.#name)) {
      return this.#context.stepResults.get(this.#name) as Output;
    }

    const entries = await Promise.all(
      Object.entries(this.#children).map(async ([name, child]) => {
        return [name, await child.execute()] as const;
      }),
    );

    const input = Object.fromEntries(entries) as ChildrenOutputs<Children>;

    this.#onChanges({ step: this.#name, status: "START" });

    const output = await this.#handler(input);

    this.#onChanges({ step: this.#name, status: "DONE", result: output });

    this.#context.stepResults.set(this.#name, output);

    return output;
  }

  toTree(): string {
    return this.#renderLines().join("\n");
  }

  #renderLines(): string[] {
    const lines: string[] = [this.#name];
    const entries = Object.entries(this.#children) as [
      string,
      WorkflowNode<any, any>,
    ][];

    entries.forEach(([_key, child], i) => {
      const isLast = i === entries.length - 1;
      const branch = isLast ? "└── " : "├── ";
      const cont = isLast ? "    " : "│   ";

      const childLines = child.#renderLines();

      childLines.forEach((line, j) => {
        if (j === 0) {
          lines.push(`${branch}${line}`);
        } else {
          lines.push(`${cont}${line}`);
        }
      });
    });

    return lines;
  }

  get name(): string {
    return this.#name;
  }
}

function buildMyWorkflow(inputs: {
  greeting: string;
  data: number[];
  url: string;
  name: string;
}) {
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
    handler: async (input) => {
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

async function run() {
  const myWorkflow = buildMyWorkflow({
    url: "https://ontologic.site",
    greeting: "Hello",
    data: [1, 2, 3, 4, 5],
    name: "Alpha",
  });

  myWorkflow.onChanges((event) => {
    switch (event.status) {
      case "DONE":
        event.result;
        console.log({ step: event.step, status: event.status });
        break;

      case "FAILED":
        event.error;
        console.log({ step: event.step, status: event.status });
        break;

      case "START":
        console.log(event);
        break;
    }
  });

  console.log(myWorkflow.toTree());

  console.log();

  const result = await myWorkflow.execute();

  console.log("RESULT:", result);
}

run().catch(console.error);

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
