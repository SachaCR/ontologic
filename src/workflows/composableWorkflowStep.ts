export class ComposableWorkflowStep<Input, Output> {
  #name: string;
  #handler: StepHandler<Input, Output>;
  #previousStep: PreviousStepHandler<Input>;
  #stepResults: Map<string, unknown>;
  #isLast: boolean;
  #success: (
    stepName: string,
    output: unknown,
    isLast: boolean,
  ) => Promise<void>;
  #failure: (stepName: string, error: Error) => Promise<void>;

  constructor(params: {
    name: string;
    handler: StepHandler<Input, Output>;
    previousStep: PreviousStepHandler<Input>;
    stepResults: Map<string, unknown>;
    success: (
      stepName: string,
      output: unknown,
      isLast: boolean,
    ) => Promise<void>;
    failure: (stepName: string, error: Error) => Promise<void>;
  }) {
    const { name, handler, previousStep, stepResults, success, failure } =
      params;
    this.#name = name;
    this.#handler = handler;
    this.#previousStep = previousStep;
    this.#stepResults = stepResults;
    this.#isLast = true;
    this.#success = success;
    this.#failure = failure;
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
      stepResults: this.#stepResults,
      success: this.#success,
      failure: this.#failure,
    });
  }

  async execute(): Promise<Output> {
    let result = this.#stepResults.get(this.#name);

    if (result !== undefined) {
      return result as Output;
    }

    const input = await this.#previousStep();

    try {
      const output = await this.#handler(input);

      this.#stepResults.set(this.#name, output);

      await this.#success(this.#name, output, this.#isLast);

      return output;
    } catch (err: unknown) {
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

      await this.#failure(this.#name, error);

      throw error;
    }
  }

  results(): Map<string, unknown> {
    return this.#stepResults;
  }

  get name(): string {
    return this.#name;
  }
}

export type StepHandler<Input, Output> = (input: Input) => Promise<Output>;

type PreviousStepHandler<Output> = () => Promise<Output>;
