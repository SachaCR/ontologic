import { WorkflowState } from "../interfaces";

export interface WorkflowStateRepository {
  save: (state: WorkflowState<unknown>) => Promise<void>;
  getById: (id: string) => Promise<WorkflowState<unknown> | undefined>;
}
