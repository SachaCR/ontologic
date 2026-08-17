import { WorkflowChangeEvent, WorkflowState } from "../interfaces";
import { WorkflowStateRepository } from "../repository/interfaces";
import { Graph, renderGraph, RenderTreeOptions } from "./renderGraph";
import { WorkflowNode } from "./workflowNode";

export class GraphWorkflow<Input, Output> {
  #repository: WorkflowStateRepository;
  #rootNode: WorkflowNode<any, Output> | undefined;
  #state: WorkflowState<Input>;
  #onChangesHandler: (event: WorkflowChangeEvent) => void;

  constructor(params: {
    id: string;
    input: Input;
    name: string;
    repository: WorkflowStateRepository;
    stepResults?: Map<string, unknown>;
  }) {
    const { id, name, input, repository, stepResults } = params;
    this.#repository = repository;
    this.#onChangesHandler = () => {};

    this.#state = {
      id,
      name,
      input,
      status: "TODO",
      stepResults: stepResults ? stepResults : new Map<string, unknown>(),
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

    this.#state.status = "IN_PROGRESS";

    await this.#repository.save(this.#state);

    const output = await this.#rootNode.execute();

    if (this.state.status !== "FAILED") {
      this.#state.status = "DONE";
    }

    await this.#repository.save(this.#state);

    // We do this after having saved the state. This way if the onChangesHandler throw we don't lose the state.
    if (this.state.status !== "FAILED") {
      this.#onChangesHandler({ step: this.name, status: this.#state.status });
    }

    return output;
  }

  onChanges(handler: (event: WorkflowChangeEvent) => void) {
    this.#onChangesHandler = handler;
    this.#rootNode?.onChanges(handler);
  }

  getGraph(): Graph {
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
