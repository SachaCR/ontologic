import { randomUUID } from "node:crypto";
import {
  WorkflowChangeEvent,
  WorkflowState,
  WorkflowStatus,
} from "../interfaces";
import { Graph, renderGraph, RenderTreeOptions } from "./renderGraph";

type ChildrenOutputs<C extends Record<string, WorkflowNode<any, any>>> = {
  [K in keyof C]: C[K] extends WorkflowNode<any, infer O> ? O : never;
};

export class WorkflowNode<
  Children extends Record<string, WorkflowNode<any, unknown>>,
  Output,
> {
  #name: string;
  #children: Children;
  #handler: (input: ChildrenOutputs<Children>) => Promise<Output>;
  #context: WorkflowState<unknown>;
  #status: WorkflowStatus;

  #onChanges: (event: WorkflowChangeEvent) => void;

  constructor(params: {
    name: string;
    children: Children;
    handler: (input: ChildrenOutputs<Children>) => Promise<Output>;
  }) {
    this.#name = params.name;
    this.#children = params.children;
    this.#handler = params.handler;
    this.#onChanges = () => {};
    this.#status = "TODO";
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

  onChanges(handler: (event: WorkflowChangeEvent) => void) {
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
      this.#status = "DONE";
      this.#onChanges({ step: this.#name, status: "DONE" });
      return this.#context.stepResults.get(this.#name) as Output;
    }

    const entries = await Promise.all(
      Object.entries(this.#children).map(async ([name, child]) => {
        return [name, await child.execute()] as const;
      }),
    );

    const input = Object.fromEntries(entries) as ChildrenOutputs<Children>;

    this.#status = "IN_PROGRESS";

    this.#onChanges({ step: this.#name, status: "IN_PROGRESS" });

    try {
      const output = await this.#handler(input);

      this.#context.stepResults.set(this.#name, output);
      this.#status = "DONE";

      this.#onChanges({ step: this.#name, status: "DONE" });

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

    // Mark the workflow as failed
    this.#context.status = "FAILED";

    // Mark this node as failed
    this.#status = "FAILED";

    this.#context.error = {
      step: this.#name,
      error: error.message,
      name: error.name,
    };

    this.#onChanges({ step: this.#name, status: "FAILED", error });

    return error;
  }

  getGraph(): Graph {
    const childs = Object.values(this.#children).map((child) =>
      child.getGraph(),
    );

    return {
      name: this.#name,
      status: this.#status,
      childs,
      toString: (opts?: RenderTreeOptions) =>
        renderGraph({ name: this.#name, status: this.#status, childs }, opts),
    };
  }

  get name(): string {
    return this.#name;
  }
}
