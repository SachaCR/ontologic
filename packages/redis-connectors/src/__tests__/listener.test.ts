import { describe, it, expect, beforeEach, vi } from "vitest";

import { RedisListener } from "../listener";
import type { ReceivedMessage } from "ontologic";

import {
  createRedisClientMock,
  type RedisClientMock,
} from "./helpers/redisClientMock";

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("redis", () => ({ createClient }));

let client: RedisClientMock;

beforeEach(() => {
  client = createRedisClientMock();
  createClient.mockReturnValue(client);
});

function listener(topicName = "responses") {
  return new RedisListener({ topicName, redisUrl: "redis://localhost:6379" });
}

describe("RedisListener", () => {
  it("identifies itself as a listener", () => {
    expect(listener().kind).toBe("listener");
  });

  it("reports the topic it was given", () => {
    expect(listener("responses-42").topicName()).toBe("responses-42");
  });

  it("starts stopped", () => {
    expect(listener().status).toBe("STOPPED");
  });

  it("refuses to start with no handler registered", async () => {
    await expect(listener().start()).rejects.toThrow(
      "[Redis/Listener] No handler set on message",
    );
  });

  it("checks for a handler before opening a connection", async () => {
    // The guard is worth nothing if it fires after the socket is up.
    await listener()
      .start()
      .catch(() => {});

    expect(client.connect).not.toHaveBeenCalled();
  });

  it("subscribes to its topic on start", async () => {
    const connector = listener("responses-7");
    connector.onMessage(async () => {});

    await connector.start();

    expect(client.subscribe).toHaveBeenCalledWith(
      "responses-7",
      expect.any(Function),
    );
    expect(connector.status).toBe("STARTED");
  });

  it("hands a delivered message to the handler", async () => {
    const connector = listener();
    const seen: ReceivedMessage[] = [];
    connector.onMessage(async (message) => {
      seen.push(message);
    });
    await connector.start();

    await client.subscriptionHandler?.('{"commandId":"cmd-1"}');

    expect(seen.map((message) => message.content)).toEqual([
      '{"commandId":"cmd-1"}',
    ]);
  });

  it("gives the handler no-op ack and nack", async () => {
    // Responses are volatile: pub/sub has nothing to acknowledge, and saying so
    // honestly is better than pretending the calls do something.
    const connector = listener();
    let received: ReceivedMessage | undefined;
    connector.onMessage(async (message) => {
      received = message;
    });
    await connector.start();

    await client.subscriptionHandler?.("payload");

    await expect(received?.ack()).resolves.toBeUndefined();
    await expect(received?.nack()).resolves.toBeUndefined();
  });

  it("contains a rejecting handler instead of letting it escape", async () => {
    const connector = listener();
    connector.onMessage(async () => {
      throw new Error("handler blew up");
    });
    await connector.start();

    await expect(
      client.subscriptionHandler?.("payload"),
    ).resolves.toBeUndefined();
  });

  it("reports a rejecting handler through onError", async () => {
    const connector = listener();
    const reported: Error[] = [];
    connector.onError((error) => reported.push(error));
    connector.onMessage(async () => {
      throw new Error("handler blew up");
    });
    await connector.start();

    await client.subscriptionHandler?.("payload");

    expect(reported.map((error) => error.message)).toEqual(["handler blew up"]);
  });

  it("reports client errors through onError", () => {
    const connector = listener();
    const reported: Error[] = [];
    connector.onError((error) => reported.push(error));

    client.emit("error", new Error("connection lost"));

    expect(reported.map((error) => error.message)).toEqual(["connection lost"]);
  });

  it("wraps a failure to start with the topic that failed", async () => {
    client.connect.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const connector = listener("responses-9");
    connector.onMessage(async () => {});

    await expect(connector.start()).rejects.toThrow(
      '[Redis/Listener] Failed to start for topic "responses-9"',
    );
  });

  it("quits on stop", async () => {
    const connector = listener();
    connector.onMessage(async () => {});
    await connector.start();

    await connector.stop();

    expect(client.quit).toHaveBeenCalledTimes(1);
    expect(connector.status).toBe("STOPPED");
  });
});
