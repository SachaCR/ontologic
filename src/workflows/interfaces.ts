export interface WorkflowState<Input> {
  id: string;
  name: string;
  input: Input;
  stepResults: Map<string, unknown>;
  error: { step: string; error: string; name: string } | undefined;
  status: "TODO" | "IN_PROGRESS" | "FAILED" | "DONE";
}
