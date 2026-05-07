import { DomainEntity } from "../domainEntity";
import { ComposableWorkflowStep, StepHandler } from "./composableWorkflowStep";

export interface WorkflowState<Input> {
  id: string;
  name: string;
  input: Input;
  stepResults: Map<string, unknown>;
  error: { step: string; error: string } | undefined;
}

export class WorkflowBuilder<Input> extends DomainEntity<WorkflowState<Input>> {
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

    super(params.id, state);
  }

  static fromState<Input>(
    id: string,
    state: WorkflowState<Input>,
  ): WorkflowBuilder<Input> {
    return new WorkflowBuilder({
      id,
      name: state.name,
      input: state.input,
      stepResult: state.stepResults,
    });
  }

  addStep<Output>(
    step: WorkflowStep<Input, Output>,
  ): ComposableWorkflowStep<Input, Output> {
    return new ComposableWorkflowStep({
      name: step.name,
      handler: step.handler,
      stepResults: this.state.stepResults,
      previousStep: async () => await Promise.resolve(this.state.input),
      success: async (step: string, output: unknown, isLast: boolean) => {
        return await this.#stepSuccess(step, output, isLast);
      },
      failure: async (step: string, error: Error) => {
        return await this.#stepFailure(step, error);
      },
    });
  }

  async #stepSuccess(
    step: string,
    output: unknown,
    isLast: boolean,
  ): Promise<void> {
    this.state.stepResults.set(step, output);

    if (isLast) {
      // TODO: call repository to save state
    }

    return Promise.resolve();
  }

  async #stepFailure(step: string, error: Error): Promise<void> {
    console.log(step, error);
    this.state.error = {
      step,
      error: error.message,
    };

    // TODO: Call repository to save state and error
    return Promise.resolve();
  }

  results(): Map<string, unknown> {
    return this.state.stepResults;
  }

  get name(): string {
    return this.state.name;
  }
}

export interface WorkflowStep<Input, Output> {
  name: string;
  handler: StepHandler<Input, Output>;
}
