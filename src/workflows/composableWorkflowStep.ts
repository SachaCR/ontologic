export class ComposableWorkflowStep<Input, Output> {
  #name: string;
  #handler: StepHandler<Input, Output>;
  #previousStep: PreviousStepHandler<Input>;

  constructor(params: {
    name: string;
    handler: StepHandler<Input, Output>;
    previousStep: PreviousStepHandler<Input>;
  }) {
    const { name, handler, previousStep } = params;
    this.#name = name;
    this.#handler = handler;
    this.#previousStep = previousStep;
  }

  addStep<NextOutput>(params: {
    name: string;
    handler: StepHandler<Output, NextOutput>;
  }): ComposableWorkflowStep<Output, NextOutput> {
    const { name, handler } = params;

    return new ComposableWorkflowStep({
      name,
      handler,
      previousStep: () => this.execute(),
    });
  }

  async execute(): Promise<Output> {
    const input = await this.#previousStep();
    return await this.#handler(input);
  }

  get name(): string {
    return this.#name;
  }
}

export type StepHandler<Input, Output> = (input: Input) => Promise<Output>;

type PreviousStepHandler<Output> = () => Promise<Output>;
