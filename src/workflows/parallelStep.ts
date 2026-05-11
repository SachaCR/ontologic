import { PreviousStepHandler, StepHandler } from "./composableWorkflowStep";
import { WorkflowState } from "./workflow";

export class ParallelStep<Input> {
  #name: string;
  #handlers: { name: string; handler: StepHandler<Input, unknown> }[];
  #previousStep: PreviousStepHandler<Input>;
  #workflowState: WorkflowState<unknown>;
  #isLast: boolean;

  constructor(params: {
    name: string;
    handlers: { name: string; handler: StepHandler<Input, unknown> }[];
    previousStep: PreviousStepHandler<Input>;
    workflowState: WorkflowState<unknown>;
  }) {
    const { name, handlers, previousStep, workflowState } = params;

    this.#name = name;
    this.#handlers = handlers;
    this.#previousStep = previousStep;
    this.#workflowState = workflowState;
    this.#isLast = true;
  }

  async execute(): Promise<Record<string, unknown>> {
    const input = await this.#previousStep();
    const entries = await Promise.all(
      this.#handlers.map(
        async ({ name, handler }) => [name, await handler(input)] as const,
      ),
    );

    return Object.fromEntries(entries);
  }
}
