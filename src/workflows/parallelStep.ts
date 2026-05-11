import {
  ComposableWorkflowStep,
  PreviousStepHandler,
  StepHandler,
} from "./composableWorkflowStep";
import { WorkflowState } from "./workflow";

export class ParallelStep<Input> {
  #name: string;
  #handlers: StepHandler<Input, unknown>[];
  #previousStep: PreviousStepHandler<Input>;
  #workflowState: WorkflowState<unknown>;
  #isLast: boolean;

  constructor(params: {
    name: string;
    handlers: Array<StepHandler<Input, unknown>>;
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

  async execute(): Promise<Merge<Output>>;
}


type MergeOutput = 
