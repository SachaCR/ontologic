import { ComposableWorkflowStep, StepHandler } from "./composableWorkflowStep";

export interface WorkflowState<Input> {
  id: string;
  name: string;
  input: Input;
  stepResults: Map<string, unknown>;
  error: { step: string; error: string } | undefined;
}

export class WorkflowBuilder<Input> {
  #state: WorkflowState<Input>;

  constructor(params: {
    id: string;
    name: string;
    input: Input;
    stepResult?: Map<string, unknown>;
  }) {
    const state: WorkflowState<Input> = {
      name: params.name,
      id: params.id,
      input: params.input,
      stepResults: params.stepResult
        ? params.stepResult
        : new Map<string, unknown>(),
      error: undefined,
    };

    this.#state = state;
  }

  addStep<Output>(
    step: WorkflowStep<Input, Output>,
  ): ComposableWorkflowStep<Input, Output> {
    return new ComposableWorkflowStep({
      name: step.name,
      handler: step.handler,
      workflowState: this.#state,
      previousStep: async () => await Promise.resolve(this.#state.input),
    });
  }

  get name(): string {
    return this.#state.name;
  }
}

export interface WorkflowStep<Input, Output> {
  name: string;
  handler: StepHandler<Input, Output>;
}
