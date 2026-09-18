import { type CommandBusResponse } from "./interfaces";

export interface CommandTimeout {
  /**
   * Resolves with a `TIMEOUT_ERROR` failure response once `ms` has elapsed,
   * unless `cancel` was called first.
   */
  promise: Promise<CommandBusResponse>;

  /**
   * Clears the underlying timer. Safe to call more than once, and after the
   * promise has already resolved.
   *
   * A cancelled timeout never resolves. It is only ever raced against the
   * command promise, so the caller has already moved on by then.
   */
  cancel: () => void;
}

/**
 * Builds the losing side of the race in `CommandBusEmitter.send`.
 *
 * The caller MUST `cancel` it once the race settles. Without that, a command
 * that answered in 5ms still pins a timer for the full timeout: the timers pile
 * up under load, and they keep the Node event loop alive on shutdown.
 */
export function waitForTimeout(ms: number, commandId: string): CommandTimeout {
  let timer: ReturnType<typeof setTimeout>;

  const promise = new Promise<CommandBusResponse>((resolve) => {
    timer = setTimeout(() => {
      const error = new Error(
        `The command handler exceeded the expected timeout (${ms}ms). Please verify if the command has been handled or not with idempotency mechanism.`,
      );

      error.name = "TIMEOUT_ERROR";

      resolve({
        commandId: commandId,
        result: "FAILURE",
        error: {
          name: error.name,
          code: "COMMAND_TIMEOUT",
          message: error.message,
          stack: error.stack ?? null,
          context: {
            commandId,
          },
        },
      });
    }, ms);
  });

  return {
    promise,
    cancel: () => {
      clearTimeout(timer);
    },
  };
}
