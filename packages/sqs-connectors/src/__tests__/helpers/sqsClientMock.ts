import { vi } from "vitest";

/**
 * A stand-in for an `SQSClient`.
 *
 * The connectors build their own client through `createSqsClient`, so replacing
 * the class is the only way to see what they send. The real command classes are
 * kept, so assertions read `command.input` exactly as the SDK shapes it.
 */
export function createSqsClientMock() {
  const responses = new Map<string, unknown>();

  const mock = {
    destroy: vi.fn(),

    send: vi.fn(async (command: { constructor: { name: string } }) => {
      const queued = responses.get(command.constructor.name);

      if (queued !== undefined) {
        return queued;
      }

      if (command.constructor.name === "ReceiveMessageCommand") {
        // Idle like a real long poll. Returning instantly would spin the read
        // loop as fast as the event loop allows and exhaust the heap.
        await new Promise((resolve) => setTimeout(resolve, 5));
      }

      return {};
    }),

    /** Test-only: what `send` returns for a given command class. */
    respondTo(commandName: string, response: unknown) {
      responses.set(commandName, response);
    },

    /** Test-only: every command of one kind that was sent. */
    commandsOfType(commandName: string) {
      return mock.send.mock.calls
        .map((call) => call[0] as { constructor: { name: string } })
        .filter((command) => command.constructor.name === commandName);
    },
  };

  return mock;
}

export type SqsClientMock = ReturnType<typeof createSqsClientMock>;

export const QUEUE_URL = "http://localhost:4566/000000000000/commands.fifo";

export const flush = () => new Promise((resolve) => setTimeout(resolve, 20));

/** Waits until `predicate` holds, or gives up. Steadier than a fixed sleep. */
export async function waitUntil(
  predicate: () => boolean,
  timeoutMs = 2000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (!predicate() && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

/** The error a promise rejected with, typed. Fails loudly if it resolves. */
export async function rejectionOf(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (error: unknown) {
    return error as Error;
  }

  throw new Error("Expected the promise to reject, but it resolved");
}
