import { WorkflowState } from "../interfaces";
import { WorkflowStateRepository } from "../repository/interfaces";
import { Graph, renderGraph, RenderTreeOptions } from "./renderGraph";
import { WorkflowNode } from "./workflowNode";

export class GraphWorkflow<Input, Output> {
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

    if (this.#state.status !== "FAILED") {
      this.#state.status = "DONE";
    }

    await this.#repository.save(this.#state);

    return output as Output;
  }

  onChanges(
    handler: (
      event:
        | { step: string; status: "IN_PROGRESS" }
        | { step: string; status: "DONE" }
        | { step: string; status: "FAILED"; error: Error },
    ) => void,
  ) {
    this.#rootNode?.onChanges(handler);
  }

  getGraph(): Graph | undefined {
    const child = this.#rootNode?.getGraph();

    const childs: Graph[] = [];

    if (child) {
      childs.push(child);
    }

    return {
      name: this.name,
      status: this.#state.status,
      childs,
      toString: (opts: RenderTreeOptions) =>
        renderGraph(
          { name: this.name, status: this.#state.status, childs },
          opts,
        ),
    };
  }

  get name(): string {
    return this.#state.name;
  }
}
