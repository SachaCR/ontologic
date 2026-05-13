import { EventEmitter } from "node:events";
import { ComposableWorkflowStep, StepHandler } from "./composableWorkflowStep";
import { aggregateFunction, AggregateOutput } from "./parallelStep";
import { WorkflowState } from "../interfaces";

export interface WorkflowStep<Input, Output> {
  name: string;
  handler: StepHandler<Input, Output>;
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

  addStepWithSubtasks<
    const Substasks extends readonly {
      name: string;
      handler: (input: Input) => Promise<unknown>;
    }[],
  >(params: {
    name: string;
    subtasks: Substasks;
  }): ComposableWorkflowStep<Input, AggregateOutput<Substasks>> {
    const { name, subtasks } = params;

    return new ComposableWorkflowStep({
      workflowState: this.#state,
      eventEmitter: this.#eventEmitter,
      name: name,
      previousStep: async () => await Promise.resolve(this.#state.input),
      handler: async (input: Input): Promise<AggregateOutput<Substasks>> => {
        const result = await aggregateFunction(
          subtasks,
          input,
          this.#eventEmitter,
        );
        return result as AggregateOutput<Substasks>;
      },
    });
  }

  onChanges(
    handler: (
      event:
        | { step: string; status: "START" }
        | { step: string; status: "DONE" }
        | { step: string; status: "FAILED"; error: Error },
    ) => void,
  ) {
    this.#eventEmitter.on("change", handler);
  }

  get name(): string {
    return this.#state.name;
  }
}
