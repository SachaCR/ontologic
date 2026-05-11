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
>(handlers: H, input: Input): Promise<AggregateOutput<H>> {
  const entries = await Promise.all(
    handlers.map(
      async ({ name, handler }) => [name, await handler(input)] as const,
    ),
  );

  return Object.fromEntries(entries) as AggregateOutput<H>;
}
