import { vi } from "vitest";

/**
 * A stand-in for a node-redis client.
 *
 * The connectors build their own client through `createClient`, so the only way
 * to see what they send — and the only way to reach failure paths like a
 * rejected `XACK` — is to replace the module. Each test file does:
 *
 *   const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));
 *   vi.mock("redis", () => ({ createClient }));
 *
 * and points `createClient` at one of these.
 */
export function createRedisClientMock() {
  const eventHandlers = new Map<string, ((...args: unknown[]) => void)[]>();

  /** Replies `xReadGroup` hands back, in order, before it starts idling. */
  const streamReplies: unknown[] = [];

  const mock = {
    connect: vi.fn(async () => undefined),
    quit: vi.fn(async () => undefined),
    ping: vi.fn(async () => "PONG"),
    publish: vi.fn(async (_topic: string, _message: string) => 1),

    xAdd: vi.fn(
      async (_stream: string, _id: string, _fields: Record<string, string>) =>
        "1-1",
    ),

    xAck: vi.fn(async (_stream: string, _group: string, _id: string) => 1),

    xGroupCreate: vi.fn(
      async (
        _stream: string,
        _group: string,
        _from: string,
        _options?: { MKSTREAM?: boolean },
      ) => "OK",
    ),

    subscribe: vi.fn(
      async (_topic: string, handler: (message: string) => void) => {
        mock.subscriptionHandler = handler;
      },
    ),

    xReadGroup: vi.fn(
      async (
        _group: string,
        _consumer: string,
        _from: { key: string; id: string },
        _options: { COUNT?: number; BLOCK?: number },
      ) => {
        const next = streamReplies.shift();

        if (next !== undefined) {
          return next;
        }

        // Idle like a real BLOCK would, so the read loop does not spin hot while
        // a test is setting up its assertions.
        await new Promise((resolve) => setTimeout(resolve, 5));

        return null;
      },
    ),

    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      eventHandlers.set(event, [...(eventHandlers.get(event) ?? []), handler]);
    }),

    /** Test-only: the pub/sub callback `subscribe()` registered. */
    subscriptionHandler: undefined as ((message: string) => void) | undefined,

    /** Test-only: fire a client event, as node-redis would. */
    emit(event: string, ...args: unknown[]) {
      for (const handler of eventHandlers.get(event) ?? []) {
        handler(...args);
      }
    },

    /** Test-only: queue what the next `xReadGroup` calls return. */
    queueStreamReplies(...replies: unknown[]) {
      streamReplies.push(...replies);
    },
  };

  return mock;
}

export type RedisClientMock = ReturnType<typeof createRedisClientMock>;

/** One stream entry in the shape `xReadGroup` returns. */
export function streamEntries(
  entries: { id: string; message: Record<string, string> }[],
) {
  return [{ name: "stream", messages: entries }];
}

export const flush = () => new Promise((resolve) => setTimeout(resolve, 20));

/** The error a promise rejected with, typed. Fails loudly if it resolves. */
export async function rejectionOf(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (error: unknown) {
    return error as Error;
  }

  throw new Error("Expected the promise to reject, but it resolved");
}
