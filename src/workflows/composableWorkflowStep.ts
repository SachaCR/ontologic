export class ComposableWorkflowStep<Input, Output> {
  #name: string;
  #handler: StepHandler<Input, Output>;
  #previousStep: PreviousStepHandler<Input>;
  #stepResults: Map<string, unknown>;
  #isLast: boolean;

  constructor(params: {
    name: string;
    handler: StepHandler<Input, Output>;
    previousStep: PreviousStepHandler<Input>;
    stepResults: Map<string, unknown>;
  }) {
    const { name, handler, previousStep, stepResults } = params;
    this.#name = name;
    this.#handler = handler;
    this.#previousStep = previousStep;
    this.#stepResults = stepResults;
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
      stepResults: this.#stepResults,
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

      if (this.#isLast) {
        // TODO SAVE RESULTS
      }

      return output;
    } catch (err: unknown) {
      // TODO SAVE RESULTS

      let message = "";
      let name = "Unknown Error";

      if (err instanceof Error) {
        message = err.message;
        name = err.name;
      }

      throw new Error(`Step: ${this.#name} failed with: ${name} ${message}`, {
        cause: err,
      });
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
