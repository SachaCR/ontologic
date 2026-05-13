import { EventEmitter } from "node:events";
import { aggregateFunction, AggregateOutput } from "./parallelStep";
import { WorkflowState } from "../interfaces";
import { WorkflowStateRepository } from "../repository/interfaces";

export class ComposableWorkflowStep<Input, Output> {
  #name: string;
  #handler: StepHandler<Input, Output>;
  #previousStep: PreviousStepHandler<Input>;
  #workflowState: WorkflowState<unknown>;
  #isLast: boolean;
  #eventEmitter: EventEmitter;

  constructor(params: {
    name: string;
    handler: StepHandler<Input, Output>;
    previousStep: PreviousStepHandler<Input>;
    workflowState: WorkflowState<unknown>;
    eventEmitter: EventEmitter;
  }) {
    const { name, handler, previousStep, workflowState, eventEmitter } = params;
    this.#name = name;
    this.#handler = handler;
    this.#previousStep = previousStep;
    this.#workflowState = workflowState;
    this.#isLast = true;
    this.#eventEmitter = eventEmitter;
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
      eventEmitter: this.#eventEmitter,
    });
  }

  addStepWithSubtasks<
    const Substasks extends readonly {
      name: string;
      handler: (input: Output) => Promise<unknown>;
    }[],
  >(params: {
    name: string;
    subtasks: Substasks;
  }): ComposableWorkflowStep<Output, AggregateOutput<Substasks>> {
    const { name, subtasks } = params;

    return new ComposableWorkflowStep({
      workflowState: this.#workflowState,
      eventEmitter: this.#eventEmitter,
      name: name,
      previousStep: () => this.execute(),
      handler: async (input: Output): Promise<AggregateOutput<Substasks>> => {
        const result = await aggregateFunction(
          subtasks,
          input,
          this.#eventEmitter,
        );

        return result as AggregateOutput<Substasks>;
      },
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

    this.#eventEmitter.emit("change", {
      step: this.#name,
      status: "IN_PROGRESS",
    });

    try {
      const output = await this.#handler(input);

      this.#workflowState.stepResults.set(this.#name, output);

      if (this.#isLast) {
        this.#workflowState.status = "DONE";
      }

      this.#eventEmitter.emit("change", { step: this.#name, status: "DONE" });

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

    this.#eventEmitter.emit("change", {
      step: this.#name,
      status: "FAILED",
      error,
    });

    return error;
  }

  results(): Map<string, unknown> {
    return this.#workflowState.stepResults;
  }

  status() {
    return this.#workflowState.status;
  }

  onChanges(
    handler: (
      event:
        | { step: string; status: "IN_PROGRESS" }
        | { step: string; status: "DONE" }
        | { step: string; status: "FAILED"; error: Error },
    ) => void,
  ) {
    this.#eventEmitter.on("change", handler);
  }

  get name(): string {
    return this.#workflowState.name;
  }
}

export type StepHandler<Input, Output> = (input: Input) => Promise<Output>;

export type PreviousStepHandler<Output> = () => Promise<Output>;
