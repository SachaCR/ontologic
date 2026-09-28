import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { RedisOrderedListener } from "../orderedListener";

import {
  createRedisClientMock,
  flush,
  streamEntries,
  type RedisClientMock,
} from "./helpers/redisClientMock";

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("redis", () => ({ createClient }));

let client: RedisClientMock;
let running: InstanceType<typeof RedisOrderedListener>[] = [];

beforeEach(() => {
  client = createRedisClientMock();
  createClient.mockReturnValue(client);
  running = [];
});

afterEach(async () => {
  // The read loop outlives the assertion, so every started listener has to be
  // stopped or vitest hangs on an open handle.
  await Promise.all(running.map((listener) => listener.stop().catch(() => {})));
});

function listener(
  overrides?: Partial<{
    topicName: string;
    groupName: string;
    consumerName: string;
    blockMs: number;
  }>,
) {
  const created = new RedisOrderedListener({
    topicName: overrides?.topicName ?? "commands",
    redisUrl: "redis://localhost:6379",
    blockMs: overrides?.blockMs ?? 5,
    ...(overrides?.groupName === undefined
      ? {}
      : { groupName: overrides.groupName }),
    ...(overrides?.consumerName === undefined
      ? {}
      : { consumerName: overrides.consumerName }),
  });

  running.push(created);

  return created;
}

async function started(
  handler: Parameters<
    InstanceType<typeof RedisOrderedListener>["onMessage"]
  >[0],
  overrides?: Parameters<typeof listener>[0],
) {
  const connector = listener(overrides);
  connector.onMessage(handler);
  await connector.start();
  await flush();

  return connector;
}

describe("RedisOrderedListener", () => {
  it("identifies itself as an ordered listener", () => {
    expect(listener().kind).toBe("ordered-listener");
  });

  it("refuses to start with no handler registered", async () => {
    await expect(listener().start()).rejects.toThrow(
      "[Redis/OrderedListener] No handler set on message",
    );
  });

  it("checks for a handler before opening a connection", async () => {
    await listener()
      .start()
      .catch(() => {});

    expect(client.connect).not.toHaveBeenCalled();
  });

  describe("consumer group", () => {
    it("creates the group and the stream together", async () => {
      // MKSTREAM matters: a receiver usually starts before anything has been
      // published, and XGROUP CREATE on a missing stream is an error.
      await started(async () => {});

      expect(client.xGroupCreate).toHaveBeenCalledWith(
        "commands",
        "commands-consumers",
        "0",
        { MKSTREAM: true },
      );
    });

    it("tolerates a group that already exists", async () => {
      // The ordinary case on restart, not a failure.
      client.xGroupCreate.mockRejectedValueOnce(
        new Error("BUSYGROUP Consumer Group name already exists"),
      );

      const connector = listener();
      connector.onMessage(async () => {});

      await expect(connector.start()).resolves.toBeUndefined();
    });

    it("surfaces any other group creation failure", async () => {
      client.xGroupCreate.mockRejectedValueOnce(new Error("NOPERM"));

      const connector = listener();
      connector.onMessage(async () => {});

      await expect(connector.start()).rejects.toThrow(
        '[Redis/OrderedListener] Failed to start for topic "commands"',
      );
    });
  });

  describe("options", () => {
    it("derives a group name from the topic by default", async () => {
      await started(async () => {}, { topicName: "orders" });

      expect(client.xGroupCreate).toHaveBeenCalledWith(
        "orders",
        "orders-consumers",
        "0",
        expect.anything(),
      );
    });

    it("uses an explicit group name when given one", async () => {
      await started(async () => {}, { groupName: "workers" });

      expect(client.xGroupCreate).toHaveBeenCalledWith(
        "commands",
        "workers",
        "0",
        expect.anything(),
      );
    });

    it("names the consumer after the process by default", async () => {
      await started(async () => {});

      expect(client.xReadGroup).toHaveBeenCalledWith(
        "commands-consumers",
        `consumer-${process.pid}`,
        expect.anything(),
        expect.anything(),
      );
    });

    it("uses an explicit consumer name when given one", async () => {
      await started(async () => {}, { consumerName: "worker-1" });

      expect(client.xReadGroup).toHaveBeenCalledWith(
        expect.anything(),
        "worker-1",
        expect.anything(),
        expect.anything(),
      );
    });

    it("passes the block duration to the read", async () => {
      await started(async () => {}, { blockMs: 250 });

      expect(client.xReadGroup).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ BLOCK: 250 }),
      );
    });

    it("reads in batches of ten", async () => {
      await started(async () => {});

      expect(client.xReadGroup).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ COUNT: 10 }),
      );
    });
  });

  describe("recovery", () => {
    it("replays this consumer's pending entries first", async () => {
      // Anything a previous run claimed but never acked, because it crashed
      // partway through.
      client.queueStreamReplies(
        streamEntries([{ id: "1-1", message: { message: "leftover" } }]),
      );

      const seen: string[] = [];
      await started(async (message) => {
        seen.push(message.content);
        await message.ack();
      });

      expect(seen).toEqual(["leftover"]);
      expect(client.xReadGroup.mock.calls[0]?.[2]).toEqual({
        key: "commands",
        id: "0",
      });
    });

    it("switches to undelivered entries once the backlog is drained", async () => {
      await started(async () => {});

      const cursors = client.xReadGroup.mock.calls.map(
        (call) => (call[2] as { id: string }).id,
      );

      expect(cursors[0]).toBe("0");
      expect(cursors).toContain(">");
    });
  });

  describe("dispatch", () => {
    it("acknowledges an entry the handler accepted", async () => {
      client.queueStreamReplies(
        streamEntries([{ id: "5-1", message: { message: "payload" } }]),
      );

      await started(async (message) => {
        await message.ack();
      });

      expect(client.xAck).toHaveBeenCalledWith(
        "commands",
        "commands-consumers",
        "5-1",
      );
    });

    it("leaves an entry pending when the handler nacks", async () => {
      // Not acking is how it stays claimed and reclaimable.
      client.queueStreamReplies(
        streamEntries([{ id: "5-1", message: { message: "payload" } }]),
      );

      await started(async (message) => {
        await message.nack();
      });

      expect(client.xAck).not.toHaveBeenCalled();
    });

    it("acks a malformed entry rather than wedging the pending list", async () => {
      // No retry can fix a missing field, so leaving it claimed forever would
      // stop the group advancing.
      client.queueStreamReplies(
        streamEntries([{ id: "9-1", message: { notTheField: "oops" } }]),
      );

      const seen: string[] = [];
      await started(async (message) => {
        seen.push(message.content);
      });

      expect(seen).toEqual([]);
      expect(client.xAck).toHaveBeenCalledWith(
        "commands",
        "commands-consumers",
        "9-1",
      );
    });

    it("reports a malformed entry through onError", async () => {
      client.queueStreamReplies(
        streamEntries([{ id: "9-1", message: { notTheField: "oops" } }]),
      );

      const connector = listener();
      const reported: Error[] = [];
      connector.onError((error) => reported.push(error));
      connector.onMessage(async () => {});
      await connector.start();
      await flush();

      expect(reported[0]?.message).toBe(
        '[Redis/OrderedListener] Stream entry 9-1 has no "message" field',
      );
    });

    it("reports a rejecting handler without stopping the loop", async () => {
      client.queueStreamReplies(
        streamEntries([
          { id: "1-1", message: { message: "first" } },
          { id: "1-2", message: { message: "second" } },
        ]),
      );

      const seen: string[] = [];
      const connector = listener();
      const reported: Error[] = [];
      connector.onError((error) => reported.push(error));
      connector.onMessage(async (message) => {
        seen.push(message.content);
        throw new Error("handler blew up");
      });
      await connector.start();
      await flush();

      expect(seen).toEqual(["first", "second"]);
      expect(reported.map((error) => error.message)).toEqual([
        "handler blew up",
        "handler blew up",
      ]);
    });

    it("reports a failed ack", async () => {
      client.queueStreamReplies(
        streamEntries([{ id: "5-1", message: { message: "payload" } }]),
      );
      client.xAck.mockRejectedValueOnce(new Error("The client is closed"));

      const connector = listener();
      const reported: Error[] = [];
      connector.onError((error) => reported.push(error));
      connector.onMessage(async (message) => {
        await message.ack();
      });
      await connector.start();
      await flush();

      expect(reported[0]?.message).toBe(
        "[Redis/OrderedListener] Failed to ack entry 5-1",
      );
    });
  });

  describe("stop", () => {
    it("stops reading and quits", async () => {
      const connector = await started(async () => {});

      await connector.stop();
      const callsAtStop = client.xReadGroup.mock.calls.length;
      await flush();

      expect(connector.status).toBe("STOPPED");
      expect(client.quit).toHaveBeenCalledTimes(1);
      expect(client.xReadGroup.mock.calls.length).toBe(callsAtStop);
    });

    it("does nothing when it never started", async () => {
      await listener().stop();

      expect(client.quit).not.toHaveBeenCalled();
    });
  });
});
