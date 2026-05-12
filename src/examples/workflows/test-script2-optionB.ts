type ChildrenOutputs<C extends Record<string, WorkflowNode<any, any>>> = {
  [K in keyof C]: C[K] extends WorkflowNode<any, infer O> ? O : never;
};

export class WorkflowNode<
  Children extends Record<string, WorkflowNode<any, any>>,
  Output,
> {
  #name: string;
  #children: Children;
  #handler: (input: ChildrenOutputs<Children>) => Promise<Output>;

  constructor(params: {
    name: string;
    children: Children;
    handler: (input: ChildrenOutputs<Children>) => Promise<Output>;
  }) {
    this.#name = params.name;
    this.#children = params.children;
    this.#handler = params.handler;
  }

  async execute(): Promise<Output> {
    console.log("STEP:", this.#name);

    const entries = await Promise.all(
      Object.entries(this.#children).map(
        async ([name, child]) => [name, await child.execute()] as const,
      ),
    );
    const input = Object.fromEntries(entries) as ChildrenOutputs<Children>;
    return this.#handler(input);
  }

  get name(): string {
    return this.#name;
  }
}

const dataSource = new WorkflowNode({
  name: "Data Source",
  children: {},
  handler: async () => Promise.resolve({ data: [1, 2, 3, 4, 5] }),
});

const nameSource = new WorkflowNode({
  name: "Name Source",
  children: {},
  handler: async () => Promise.resolve({ name: "alpha" }),
});

const summed = new WorkflowNode({
  name: "Sum",
  children: { source: dataSource },
  handler: async (input) =>
    Promise.resolve({ sum: input.source.data.reduce((s, c) => s + c) }),
});

const combined = new WorkflowNode({
  name: "Combine",
  children: { total: summed, tag: nameSource },
  handler: async (input) =>
    Promise.resolve({ message: `${input.tag.name} = ${input.total.sum}` }),
});

async function run() {
  const result = await combined.execute();
  console.log("RESULT:", result);
}

run().catch(console.error);
