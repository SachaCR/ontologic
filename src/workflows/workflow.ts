import { ComposableWorkflowStep, StepHandler } from "./composableWorkflowStep";

export class Workflow<Input> {
  #name: string;
  #input: Input;

  constructor(params: { name: string; input: Input }) {
    this.#name = params.name;
    this.#input = params.input;
  }

  addStep<Output>(
    step: WorkflowStep<Input, Output>,
  ): ComposableWorkflowStep<Input, Output> {
    return new ComposableWorkflowStep({
      name: step.name,
      handler: step.handler,
      previousStep: async () => await Promise.resolve(this.#input),
    });
  }

  get name(): string {
    return this.#name;
  }
}

export interface WorkflowStep<Input, Output> {
  name: string;
  handler: StepHandler<Input, Output>;
}
