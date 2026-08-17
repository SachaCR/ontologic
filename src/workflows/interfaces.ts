export interface WorkflowState<Input> {
  id: string;
  name: string;
  input: Input;
  stepResults: Map<string, unknown>;
  error: { step: string; error: string; name: string } | undefined;
  status: WorkflowStatus;
}

export type WorkflowStatus = "TODO" | "IN_PROGRESS" | "FAILED" | "DONE";

/**
 * The event shape delivered to an `onChanges` handler.
 *
 * Declared once and used at every emit site: the underlying `EventEmitter` is
 * untyped, so without annotating the emitted object nothing stops a call site
 * from inventing a status that handlers can never receive.
 */
export type WorkflowChangeEvent =
  | { step: string; status: "IN_PROGRESS" }
  | { step: string; status: "DONE" }
  | { step: string; status: "FAILED"; error: Error };
