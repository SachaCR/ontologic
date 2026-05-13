import { randomUUID } from "node:crypto";
import { WorkflowState } from "../interfaces";

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
