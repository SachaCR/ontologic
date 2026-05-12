export class WorkflowNode<Input, Output> {
  #name: string;
  #handler: (input: Input) => Promise<Output>;
  #child: WorkflowNode<unknown, Input> | undefined;
  #input: Input | undefined;

  constructor(
    params:
      | {
          type: "node";
          name: string;
          handler: (input: Input) => Promise<Output>;
          child: WorkflowNode<any, Input>;
        }
      | {
          type: "leaf";
          name: string;
          handler: (input: Input) => Promise<Output>;
          input: Input;
        },
  ) {
    const { name, handler } = params;

    this.#name = name;
    this.#handler = handler;

    if (params.type === "node") {
      this.#child = params.child;
    }

    if (params.type === "leaf") {
      this.#input = params.input;
    }
  }

  static parallel(nodes: WorkflowNode<unknown, unknown>[]) {
    return new WorkflowNode();
  }

  async execute(): Promise<Output> {
    console.log("STEP:", this.#name);

    if (this.#input) {
      return await this.#handler(this.#input);
    }

    if (this.#child) {
      const input = await this.#child.execute();
      return await this.#handler(input);
    }

    throw new Error("Corrupted Node: input and child are undefined");
  }

  get name(): string {
    return this.#name;
  }
}

const node1 = new WorkflowNode({
  type: "leaf",
  name: "Sum Data",
  handler: async (input: { data: number[] }) => {
    return Promise.resolve({
      sum: input.data.reduce((sum, current) => sum + current),
    });
  },
  input: { data: [1, 2, 3, 4, 5] },
});

const node2 = new WorkflowNode({
  type: "node",
  name: "Analyse Sum",
  handler: (input: { sum: number }) => {
    const isOk = input.sum > 4;
    return Promise.resolve({ isOk });
  },
  child: node1,
});

async function run() {
  const result = await node2.execute();
  console.log("RESULT:", result);
}

run().catch(console.error);
