import { EventEmitter } from "node:events";
import { ComposableWorkflowStep, StepHandler } from "./composableWorkflowStep";
import {
  aggregateFunction,
  AggregateOutput,
  defineSubTask,
} from "./parallelStep";

export interface WorkflowState<Input> {
  id: string;
  name: string;
  input: Input;
  stepResults: Map<string, unknown>;
  error: { step: string; error: string; name: string } | undefined;
  status: "TODO" | "IN_PROGRESS" | "FAILED" | "DONE";
}

export class WorkflowBuilder<Input> {
  #state: WorkflowState<Input>;
  #eventEmitter: EventEmitter;

  constructor(params: {
    id: string;
    name: string;
    input: Input;
    stepResult?: Map<string, unknown>;
  }) {
    const state: WorkflowState<Input> = {
      status: "TODO",
      name: params.name,
      id: params.id,
      input: params.input,
      stepResults: params.stepResult
        ? params.stepResult
        : new Map<string, unknown>(),
      error: undefined,
    };

    this.#state = state;
    this.#eventEmitter = new EventEmitter({
      captureRejections: true,
    });
  }

  addStep<Output>(
    step: WorkflowStep<Input, Output>,
  ): ComposableWorkflowStep<Input, Output> {
    return new ComposableWorkflowStep({
      name: step.name,
      handler: step.handler,
      workflowState: this.#state,
      eventEmitter: this.#eventEmitter,
      previousStep: async () => await Promise.resolve(this.#state.input),
    });
  }

  parallelize<
    const Steps extends readonly {
      name: string;
      handler: (input: Input) => Promise<unknown>;
    }[],
  >(params: {
    name: string;
    steps: Steps;
  }): ComposableWorkflowStep<Input, AggregateOutput<Steps>> {
    const { name, steps } = params;

    return new ComposableWorkflowStep({
      workflowState: this.#state,
      eventEmitter: this.#eventEmitter,
      name: name,
      previousStep: async () => await Promise.resolve(this.#state.input),
      handler: async (input: Input): Promise<AggregateOutput<Steps>> => {
        const subtasks = steps.map(defineSubTask);
        const result = await aggregateFunction(
          subtasks,
          input,
          this.#eventEmitter,
        );
        return result as AggregateOutput<Steps>;
      },
    });
  }

  onChanges(
    handler: (event: { step: string; status: "DONE" | "FAILED" }) => void,
  ) {
    this.#eventEmitter.on("change", handler);
  }

  get name(): string {
    return this.#state.name;
  }
}

export interface WorkflowStep<Input, Output> {
  name: string;
  handler: StepHandler<Input, Output>;
}
