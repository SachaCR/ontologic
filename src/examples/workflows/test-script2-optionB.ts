import { randomUUID } from "node:crypto";
import {
  InMemoryWorkflowStateRepository,
  WorkflowStateRepository,
} from "../../workflows";
import { WorkflowState } from "../../workflows/workflow";

type ChildrenOutputs<C extends Record<string, WorkflowNode<any, any>>> = {
  [K in keyof C]: C[K] extends WorkflowNode<any, infer O> ? O : never;
};

export class Workflow<Input, Output> {
  #repository: WorkflowStateRepository;
  #rootNode: WorkflowNode<any, any> | undefined;
  #state: WorkflowState<Input>;

  constructor(params: {
    id: string;
    input: Input;
    name: string;
    repository: WorkflowStateRepository;
  }) {
    const { id, name, input, repository } = params;
    this.#repository = repository;

    this.#state = {
      id,
      name,
      input,
      status: "TODO",
      stepResults: new Map<string, unknown>(),
      error: undefined,
    };
  }

  get state(): WorkflowState<Input> {
    return this.#state;
  }

  protected build(builder: (input: Input) => WorkflowNode<any, Output>): void {
    this.#rootNode = builder(this.#state.input);

    this.#rootNode.setContext(this.#state);
  }

  async execute() {
    if (!this.#rootNode) {
      return;
    }

    const output = await this.#rootNode.execute();

    await this.#repository.save(this.#state);

    return output as Output;
  }

  onChanges(
    handler: (
      event:
        | { step: string; status: "START" }
        | { step: string; status: "DONE"; result: Output }
        | { step: string; status: "FAILED"; error: Error },
    ) => void,
  ) {
    this.#rootNode?.onChanges(handler);
  }

  toTree(): void {
    console.log(this.#rootNode?.toTree());
  }

  get name(): string {
    return this.#state.name;
  }
}

export class WorkflowNode<
  Children extends Record<string, WorkflowNode<any, any>>,
  Output,
> {
  #name: string;
  #children: Children;
  #handler: (input: ChildrenOutputs<Children>) => Promise<Output>;
  #context: WorkflowState<unknown>;

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
      // Set a default context
      id: randomUUID(),
      name: this.name,
      status: "TODO",
      stepResults: new Map<string, unknown>(),
      input: {},
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

  setContext(context: WorkflowState<unknown>): void {
    this.#context = context;

    Object.entries(this.#children).map(async ([_name, child]) => {
      child.setContext(context);
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

    try {
      const output = await this.#handler(input);

      this.#context.status = "DONE";
      this.#context.stepResults.set(this.#name, output);

      this.#onChanges({ step: this.#name, status: "DONE", result: output });

      return output;
    } catch (err: unknown) {
      const error: Error = this.#handleError(err);
      throw error;
    }
  }

  #handleError(err: unknown): Error {
    let message = "unknown error";
    let name = "Unknown Error";

    if (err instanceof Error) {
      message = err.message;
      name = err.name;
    }

    const error = new Error(
      `Step: ${this.#name} failed with: ${name} ${message}`,
      {
        cause: err,
      },
    );

    this.#context.status = "FAILED";

    this.#context.error = {
      step: this.#name,
      error: error.message,
      name: error.name,
    };

    this.#onChanges({ step: this.#name, status: "FAILED", error });

    return error;
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

class MyWorkflow extends Workflow<
  {
    url: string;
    greeting: string;
    data: number[];
    name: string;
  },
  string
> {
  constructor(params: {
    id: string;
    input: {
      url: string;
      greeting: string;
      data: number[];
      name: string;
    };
    repository?: WorkflowStateRepository;
  }) {
    const repo = params.repository
      ? params.repository
      : new InMemoryWorkflowStateRepository();

    super({ ...params, name: "My Workflow", repository: repo });

    this.build(buildMyWorkflow);
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
      name: "Alpha",
    },
    repository,
  });

  myWorkflow.onChanges((event) => {
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

  myWorkflow.toTree();

  console.log();

  const result = await myWorkflow.execute();

  console.log("RESULT:", result);
  console.log(await repository.getById("123"));
}

run().catch(console.error);

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
