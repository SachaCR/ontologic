import { type CommandBusResponse } from "./interfaces";

export function waitForTimeout(
  ms: number,
  commandId: string,
): Promise<CommandBusResponse> {
  return new Promise<CommandBusResponse>((resolve) => {
    setTimeout(() => {
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
}
