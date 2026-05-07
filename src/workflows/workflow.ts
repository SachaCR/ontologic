import { ComposableWorkflowStep, StepHandler } from "./composableWorkflowStep";

export class Workflow<Input> {
  #id: string;
  #name: string;
  #input: Input;
  #stepResults: Map<string, unknown>;

  constructor(params: { id: string; name: string; input: Input }) {
    this.#id = params.id;
    this.#name = params.name;
    this.#input = params.input;
    this.#stepResults = new Map<string, unknown>();
  }

  addStep<Output>(
    step: WorkflowStep<Input, Output>,
  ): ComposableWorkflowStep<Input, Output> {
    return new ComposableWorkflowStep({
      name: step.name,
      handler: step.handler,
      previousStep: async () => await Promise.resolve(this.#input),
      stepResults: this.#stepResults,
    });
  }

  results(): Map<string, unknown> {
    return this.#stepResults;
  }

  get name(): string {
    return this.#name;
  }
}

export interface WorkflowStep<Input, Output> {
  name: string;
  handler: StepHandler<Input, Output>;
}
