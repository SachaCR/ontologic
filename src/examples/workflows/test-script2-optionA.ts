type ChildrenOutputs<C extends Record<string, WorkflowNode<any, any>>> = {
  [K in keyof C]: C[K] extends WorkflowNode<any, infer O> ? O : never;
};

export class WorkflowNode<Input, Output> {
  #name: string;
  #handler: (input: Input) => Promise<Output>;
  #variant:
    | { type: "leaf"; input: Input }
    | { type: "node"; child: WorkflowNode<any, Input> }
    | { type: "parallel"; children: Record<string, WorkflowNode<any, any>> };

  constructor(
    params:
      | {
          type: "leaf";
          name: string;
          handler: (input: Input) => Promise<Output>;
          input: Input;
        }
      | {
          type: "node";
          name: string;
          handler: (input: Input) => Promise<Output>;
          child: WorkflowNode<any, Input>;
        }
      | {
          type: "parallel";
          name: string;
          handler: (input: Input) => Promise<Output>;
          children: Record<string, WorkflowNode<any, any>>;
        },
  ) {
    this.#name = params.name;
    this.#handler = params.handler;

    if (params.type === "leaf") {
      this.#variant = { type: "leaf", input: params.input };
    } else if (params.type === "node") {
      this.#variant = { type: "node", child: params.child };
    } else {
      this.#variant = { type: "parallel", children: params.children };
    }
  }

  static parallel<
    const Children extends Record<string, WorkflowNode<any, any>>,
    Output,
  >(params: {
    name: string;
    children: Children;
    handler: (input: ChildrenOutputs<Children>) => Promise<Output>;
  }): WorkflowNode<ChildrenOutputs<Children>, Output> {
    return new WorkflowNode<ChildrenOutputs<Children>, Output>({
      type: "parallel",
      name: params.name,
      handler: params.handler,
      children: params.children,
    });
  }

  async execute(): Promise<Output> {
    console.log("STEP:", this.#name);

    if (this.#variant.type === "leaf") {
      return this.#handler(this.#variant.input);
    }

    if (this.#variant.type === "node") {
      const input = await this.#variant.child.execute();
      return this.#handler(input);
    }

    const entries = await Promise.all(
      Object.entries(this.#variant.children).map(
        async ([name, child]) => [name, await child.execute()] as const,
      ),
    );

    const input = Object.fromEntries(entries) as Input;

    return this.#handler(input);
  }

  get name(): string {
    return this.#name;
  }
}

const sumData = new WorkflowNode({
  type: "leaf",
  name: "Sum Data",
  handler: async (input: { data: number[] }) =>
    Promise.resolve({ sum: input.data.reduce((s, c) => s + c) }),
  input: { data: [1, 2, 3, 4, 5] },
});

const labelData = new WorkflowNode({
  type: "leaf",
  name: "Label Data",
  handler: async (input: { name: string }) =>
    Promise.resolve({ label: `Label: ${input.name}` }),
  input: { name: "alpha" },
});

const combined = WorkflowNode.parallel({
  name: "Combine",
  children: { total: sumData, tag: labelData },
  handler: async (input) =>
    Promise.resolve({ message: `${input.tag.label} = ${input.total.sum}` }),
});

async function run() {
  const result = await combined.execute();
  console.log("RESULT:", result);
}

run().catch(console.error);
