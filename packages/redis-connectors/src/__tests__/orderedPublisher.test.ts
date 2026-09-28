import { describe, it, expect, beforeEach, vi } from "vitest";

import { RedisOrderedPublisher } from "../orderedPublisher";

import {
  createRedisClientMock,
  rejectionOf,
  type RedisClientMock,
} from "./helpers/redisClientMock";

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("redis", () => ({ createClient }));

let client: RedisClientMock;

beforeEach(() => {
  client = createRedisClientMock();
  createClient.mockReturnValue(client);
});

function publisher(topicName = "commands") {
  return new RedisOrderedPublisher({
    topicName,
    redisUrl: "redis://localhost:6379",
  });
}

describe("RedisOrderedPublisher", () => {
  it("identifies itself as an ordered publisher", () => {
    expect(publisher().kind).toBe("ordered-publisher");
  });

  it("reports the stream it was given", () => {
    expect(publisher("commands-3").topicName()).toBe("commands-3");
  });

  it("appends to the stream with a server-assigned id", async () => {
    // `*` is what makes the stream a log: entries come back in append order.
    const connector = publisher("commands-3");
    await connector.start();

    await connector.publish("payload", { orderingKey: "order-1" });

    expect(client.xAdd).toHaveBeenCalledWith("commands-3", "*", {
      orderingKey: "order-1",
      message: "payload",
    });
  });

  it("carries the ordering key as a field, not in the stream name", async () => {
    // So a reader can group on it without the publisher knowing how the
    // consuming side is partitioned.
    const connector = publisher("commands");
    await connector.start();

    await connector.publish("payload", { orderingKey: "order-9" });

    const [stream, , fields] = client.xAdd.mock.calls[0] ?? [];

    expect(stream).toBe("commands");
    expect(fields).toMatchObject({ orderingKey: "order-9" });
  });

  it("wraps a publish failure with the stream that failed", async () => {
    client.xAdd.mockRejectedValueOnce(new Error("The client is closed"));
    const connector = publisher("commands-3");
    await connector.start();

    await expect(
      connector.publish("payload", { orderingKey: "order-1" }),
    ).rejects.toThrow(
      '[Redis/OrderedPublisher] Failed to publish to stream "commands-3"',
    );
  });

  it("keeps the driver error as the cause", async () => {
    const driverError = new Error("The client is closed");
    client.xAdd.mockRejectedValueOnce(driverError);
    const connector = publisher();
    await connector.start();

    const failure = await rejectionOf(
      connector.publish("payload", { orderingKey: "order-1" }),
    );

    expect(failure.cause).toBe(driverError);
  });

  it("connects only once across repeated starts", async () => {
    const connector = publisher();

    await connector.start();
    await connector.start();

    expect(client.connect).toHaveBeenCalledTimes(1);
  });

  it("quits on stop", async () => {
    const connector = publisher();
    await connector.start();

    await connector.stop();

    expect(client.quit).toHaveBeenCalledTimes(1);
  });

  it("is unhealthy when the server does not answer PONG", async () => {
    client.ping.mockResolvedValueOnce("nope");
    const connector = publisher();
    await connector.start();

    await expect(connector.checkConnection()).rejects.toThrow(
      "[Redis/OrderedPublisher] Failed to check connection",
    );
  });
});
