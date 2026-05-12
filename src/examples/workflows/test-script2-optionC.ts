interface Executable<Output> {
  readonly name: string;
  execute(): Promise<Output>;
}

type ChildrenOutputs<C extends Record<string, Executable<any>>> = {
  [K in keyof C]: C[K] extends Executable<infer O> ? O : never;
};

export class WorkflowNode<Input, Output> implements Executable<Output> {
  #name: string;
  #handler: (input: Input) => Promise<Output>;
  #variant:
    | { type: "leaf"; input: Input }
    | { type: "node"; child: Executable<Input> };

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
          child: Executable<Input>;
        },
  ) {
    this.#name = params.name;
    this.#handler = params.handler;

    if (params.type === "leaf") {
      this.#variant = { type: "leaf", input: params.input };
    } else {
      this.#variant = { type: "node", child: params.child };
    }
  }

  async execute(): Promise<Output> {
    console.log("STEP:", this.#name);

    if (this.#variant.type === "leaf") {
      return this.#handler(this.#variant.input);
    }

    const input = await this.#variant.child.execute();
    return this.#handler(input);
  }

  get name(): string {
    return this.#name;
  }
}

export class ParallelNode<Children extends Record<string, Executable<any>>>
  implements Executable<ChildrenOutputs<Children>>
{
  #name: string;
  #children: Children;

  constructor(params: { name: string; children: Children }) {
    this.#name = params.name;
    this.#children = params.children;
  }

  async execute(): Promise<ChildrenOutputs<Children>> {
    console.log("STEP:", this.#name);

    const entries = await Promise.all(
      Object.entries(this.#children).map(
        async ([name, child]) => [name, await child.execute()] as const,
      ),
    );
    return Object.fromEntries(entries) as ChildrenOutputs<Children>;
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

const parallel = new ParallelNode({
  name: "Parallel",
  children: { total: sumData, tag: labelData },
});

const combined = new WorkflowNode({
  type: "node",
  name: "Combine",
  handler: async (input: { total: { sum: number }; tag: { label: string } }) =>
    Promise.resolve({ message: `${input.tag.label} = ${input.total.sum}` }),
  child: parallel,
});

async function run() {
  const result = await combined.execute();
  console.log("RESULT:", result);
}

run().catch(console.error);
