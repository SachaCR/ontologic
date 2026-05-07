import { WorkflowState } from "./workflow";

export class ComposableWorkflowStep<Input, Output> {
  #name: string;
  #handler: StepHandler<Input, Output>;
  #previousStep: PreviousStepHandler<Input>;
  #workflowState: WorkflowState<unknown>;
  #isLast: boolean;

  constructor(params: {
    name: string;
    handler: StepHandler<Input, Output>;
    previousStep: PreviousStepHandler<Input>;
    workflowState: WorkflowState<unknown>;
  }) {
    const { name, handler, previousStep, workflowState } = params;
    this.#name = name;
    this.#handler = handler;
    this.#previousStep = previousStep;
    this.#workflowState = workflowState;
    this.#isLast = true;
  }

  addStep<NextOutput>(params: {
    name: string;
    handler: StepHandler<Output, NextOutput>;
  }): ComposableWorkflowStep<Output, NextOutput> {
    const { name, handler } = params;

    this.#isLast = false;

    return new ComposableWorkflowStep({
      name,
      handler,
      previousStep: () => this.execute(),
      workflowState: this.#workflowState,
    });
  }

  async execute(
    repository?: Pick<WorkflowStateRepository, "save">,
  ): Promise<Output> {
    this.#workflowState.status = "IN_PROGRESS";

    // Save initial state
    if (repository) {
      await repository.save(this.#workflowState);
    }

    let result = this.#workflowState.stepResults.get(this.#name);

    if (result !== undefined) {
      return result as Output;
    }

    const input = await this.#previousStep();

    try {
      const output = await this.#handler(input);

      this.#workflowState.stepResults.set(this.#name, output);

      if (this.#isLast) {
        this.#workflowState.status = "DONE";
      }

      return output;
    } catch (err: unknown) {
      const error = this.#handleError(err);
      throw error;
    } finally {
      // Save state from either a success or a failure
      if (repository) {
        await repository.save(this.#workflowState);
      }
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

    this.#workflowState.status = "FAILED";

    this.#workflowState.error = {
      step: this.#name,
      error: error.message,
      name: error.name,
    };

    return error;
  }

  results(): Map<string, unknown> {
    return this.#workflowState.stepResults;
  }

  status() {
    return this.#workflowState.status;
  }

  get name(): string {
    return this.#workflowState.name;
  }
}

export type StepHandler<Input, Output> = (input: Input) => Promise<Output>;

type PreviousStepHandler<Output> = () => Promise<Output>;

export interface WorkflowStateRepository {
  save: (state: WorkflowState<unknown>) => Promise<void>;
  getById: (id: string) => Promise<WorkflowState<unknown> | undefined>;
}
