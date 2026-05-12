interface IWorkflowNode<Name extends string, Output> {
  name: Name;
  execute(): Output;
}

type IndexByName<C extends IWorkflowNode<string, unknown>> = {
  [N in C["name"]]: Extract<C, { name: N }>;
};

type ChildrenOutputs<C extends IWorkflowNode<string, unknown>> = {
  [N in C["name"]]: Extract<C, { name: N }> extends IWorkflowNode<N, infer O>
    ? O
    : never;
};

class LeafNode<Name extends string, Input, Output> {
  #name: Name;
  #handler: (input: Input) => Output;
  #input: Input;

  constructor(name: Name, handler: (input: Input) => Output, input: Input) {
    this.#name = name;
    this.#handler = handler;
    this.#input = input;
  }

  execute(): Output {
    return this.#handler(this.#input);
  }

  get name(): Name {
    return this.#name;
  }
}

class WorkflowNode<
  Name extends string,
  Children extends IWorkflowNode<string, unknown>,
  Output,
> implements IWorkflowNode<Name, Output> {
  #name: Name;
  #childrens: IndexByName<Children>;
  #handler: (input: ChildrenOutputs<Children>) => Output;

  constructor(
    name: Name,
    handler: (input: ChildrenOutputs<Children>) => Output,
    children: IndexByName<Children>,
  ) {
    this.#name = name;
    this.#childrens = children;
    this.#handler = handler;
  }

  execute(): Output {
    const entries = Object.entries(this.#childrens).map(
      ([name, child]) => [name, (child as Children).execute()] as const,
    );

    const result = Object.fromEntries(entries) as ChildrenOutputs<Children>;

    return this.#handler(result);
  }
  get name(): Name {
    return this.#name;
  }
}

type Node1 = IWorkflowNode<"node1", { sum: number }>;
type Node2 = IWorkflowNode<"node2", { message: string }>;
type Node3 = IWorkflowNode<"node3", { message: string; count: number }>;

type AllNodes = Node1 | Node2 | Node3;

const node3 = new LeafNode(
  "node3",
  (input) => {
    return {
      count: input.count + 1,
      message: "Done",
    };
  },
  { count: 0, message: "oups" },
);

const node1: Node1 = {
  name: "node1",
  execute: () => {
    return {
      sum: 390,
    };
  },
};

const node23: Node2 = {
  name: "node2",
  execute: () => {
    return {
      message: "toto",
    };
  },
};

// type WorkflowNode1 = IWorkflowNode<"TOTO", string>;
const workflowNode = new WorkflowNode<"TOTO", AllNodes, string>(
  "TOTO",
  (input) => {
    return input.node2.message + " " + input.node3.message;
  },
  { node1, node2: node23, node3 },
);

// type WorkflowNode2 = IWorkflowNode<"TITI", string>;
const workflowNode2 = new WorkflowNode<"TITI", Node1 | Node2, string>(
  "TITI",
  (input) => {
    return input.node2.message;
  },
  { node1, node2: node23 },
);

const workflowNode3 = new WorkflowNode<
  "TATA",
  // WorkflowNode1 | WorkflowNode2,
  typeof workflowNode | typeof workflowNode2,
  { result: string }
>(
  "TATA",
  (input) => {
    return { result: input.TITI };
  },
  { TITI: workflowNode2, TOTO: workflowNode },
);

const result = workflowNode3.execute();

console.log(result.result);
