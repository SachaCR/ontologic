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
    const entries = await Promise.all(
      Object.entries(this.#children).map(
        async ([name, child]) => [name, await child.execute()] as const,
      ),
    );
    const input = Object.fromEntries(entries) as ChildrenOutputs<Children>;

    console.log("STEP:", this.#name);

    const output = await this.#handler(input);

    console.log("STEP:", this.#name, "DONE");
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

    entries.forEach(([key, child], i) => {
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

const dataSource = new WorkflowNode({
  name: "Data Source",
  children: {},
  handler: async () => {
    await sleep(2000);
    return Promise.resolve({ data: [1, 2, 3, 4, 5] });
  },
});

const nameSource = new WorkflowNode({
  name: "Name Source",
  children: {},
  handler: async () => {
    await sleep(500);
    return Promise.resolve({ name: "alpha" });
  },
});

const summed = new WorkflowNode({
  name: "Sum",
  children: { source: dataSource },
  handler: async (input) => {
    await sleep(2000);
    return Promise.resolve({ sum: input.source.data.reduce((s, c) => s + c) });
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
      message: `Hello`,
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

async function run() {
  console.log(uppercase.toTree());

  console.log();

  const result = await uppercase.execute();

  console.log("RESULT:", result);
}

run().catch(console.error);

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
