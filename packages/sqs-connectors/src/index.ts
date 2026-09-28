// `client.ts` is internal: building clients, resolving queue URLs and
// validating FIFO names are things these connectors do, not things a caller
// does. Only the options type is public, because it is what you pass to the
// constructors. `@ontologics/redis-connectors` omits its `socketOptions.ts` for
// the same reason.
export type { SqsConnectionOptions } from "./client";
export * from "./orderedListener";
export * from "./orderedPublisher";
