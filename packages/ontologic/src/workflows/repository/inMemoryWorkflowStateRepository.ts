import { WorkflowState } from "../interfaces";

import { WorkflowStateRepository } from "./interfaces";

export class InMemoryWorkflowStateRepository implements WorkflowStateRepository {
  #states: Map<string, WorkflowState<unknown>>;

  constructor() {
    this.#states = new Map<string, WorkflowState<unknown>>();
  }

  async save(state: WorkflowState<unknown>): Promise<void> {
    this.#states.set(state.id, structuredClone(state));
  }

  async getById(id: string): Promise<WorkflowState<unknown> | undefined> {
    const state = this.#states.get(id);
    return state ? structuredClone(state) : undefined;
  }
}
