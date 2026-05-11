import {
  ComposableWorkflowStep,
  PreviousStepHandler,
  StepHandler,
} from "./composableWorkflowStep";
import { WorkflowState, WorkflowStep } from "./workflow";

export function parallelizeStep<Input>(params: {
  name: string;
  handlers: WorkflowStep<Input, unknown>[];
  previousStep: PreviousStepHandler<Input>;
  workflowState: WorkflowState<unknown>;
}): ComposableWorkflowStep<
  Input,
  HandlersOutputRecord<Input, WorkflowStep<Input, unknown>[]>
> {
  const { name, handlers, previousStep, workflowState } = params;

  return new ComposableWorkflowStep({
    workflowState,
    name,
    previousStep,
    handler: async (input: Input) => {
      const entries = await Promise.all(
        handlers.map(async ({ handler, name }) => {
          const result = await handler(input);
          return [name, result] as const;
        }),
      );

      const result = Object.fromEntries(entries);

      return result as HandlersOutputRecord<
        Input,
        WorkflowStep<Input, unknown>[]
      >;
    },
  });
}

export type HandlersOutputRecord<
  Input,
  // H extends readonly { name: string; handler: StepHandler<any, any> }[],
  H extends readonly WorkflowStep<Input, unknown>[],
> = {
  [E in H[number] as E["name"]]: E["handler"] extends StepHandler<any, infer O>
    ? O
    : never;
};

const step = parallelizeStep({
  name: "TOTO",
  handlers: [
    {
      name: "step1",
      handler: (input: number): Promise<number> => {
        return Promise.resolve(input + 2);
      },
    },
    {
      name: "step2",
      handler: (input: number): Promise<string> => {
        return Promise.resolve(`result: ${input}`);
      },
    },
  ],
  previousStep: async () => 4,
  workflowState: {
    name: "WORKF",
    input: 4,
    id: "id",
    stepResults: new Map<string, unknown>(),
    error: undefined,
    status: "TODO",
  },
});

async function run() {
  const result = await step.execute();
  console.log("RESULT: ", result);
  const test = result["step1"];
}

run().catch(console.error);
