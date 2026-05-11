import { EventEmitter } from "node:events";

export function defineSubTask<const N extends string, Input, Output>(task: {
  name: N;
  handler: (input: Input) => Promise<Output>;
}): { name: N; handler: (input: Input) => Promise<Output> } {
  return task;
}

export type AggregateOutput<
  H extends readonly { name: string; handler: (input: any) => Promise<any> }[],
> = {
  [E in H[number] as E["name"]]: E["handler"] extends (
    input: any,
  ) => Promise<infer O>
    ? O
    : never;
};

export async function aggregateFunction<
  Input,
  const H extends readonly {
    name: string;
    handler: (input: Input) => Promise<unknown>;
  }[],
>(
  handlers: H,
  input: Input,
  eventEmitter: EventEmitter,
): Promise<AggregateOutput<H>> {
  const entries = await Promise.all(
    handlers.map(async ({ name, handler }) => {
      eventEmitter.emit("change", { step: name, status: "START" });

      const result = await handler(input);

      eventEmitter.emit("change", { step: name, status: "DONE" });

      return [name, result] as const;
    }),
  );

  return Object.fromEntries(entries) as AggregateOutput<H>;
}
