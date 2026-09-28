import { describe, it, expect, beforeEach, vi } from "vitest";

import { RedisDynamicPublisher } from "../dynamicPublisher";

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

function publisher() {
  return new RedisDynamicPublisher({ redisUrl: "redis://localhost:6379" });
}

describe("RedisDynamicPublisher", () => {
  it("identifies itself as a dynamic publisher", () => {
    expect(publisher().kind).toBe("dynamic-publisher");
  });

  it("starts stopped", () => {
    expect(publisher().status).toBe("STOPPED");
  });

  it("passes the url to the client", () => {
    publisher();

    expect(createClient).toHaveBeenCalledWith(
      expect.objectContaining({ url: "redis://localhost:6379" }),
    );
  });

  it("publishes to the topic it is given, per call", async () => {
    const connector = publisher();
    await connector.start();

    await connector.publishTo({ topicName: "responses-1", message: "hello" });

    expect(client.publish).toHaveBeenCalledWith("responses-1", "hello");
  });

  it("reports STARTED once started", async () => {
    const connector = publisher();

    await connector.start();

    expect(connector.status).toBe("STARTED");
  });

  it("connects only once across repeated starts", async () => {
    const connector = publisher();

    await connector.start();
    await connector.start();

    expect(client.connect).toHaveBeenCalledTimes(1);
  });

  it("does not quit a connector that never started", async () => {
    await publisher().stop();

    expect(client.quit).not.toHaveBeenCalled();
  });

  it("quits on stop", async () => {
    const connector = publisher();
    await connector.start();

    await connector.stop();

    expect(client.quit).toHaveBeenCalledTimes(1);
    expect(connector.status).toBe("STOPPED");
  });

  it("wraps a failure to start", async () => {
    client.connect.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    await expect(publisher().start()).rejects.toThrow(
      "[Redis/DynamicPublisher] Failed to start",
    );
  });

  it("is healthy when the server answers PONG", async () => {
    const connector = publisher();
    await connector.start();

    await expect(connector.checkConnection()).resolves.toBe(true);
  });

  it("is unhealthy when the server answers anything else", async () => {
    client.ping.mockResolvedValueOnce("nope");
    const connector = publisher();
    await connector.start();

    await expect(connector.checkConnection()).rejects.toThrow(
      "[Redis/DynamicPublisher] Failed to check connection",
    );
  });

  it("reports client errors through onError", async () => {
    const connector = publisher();
    const reported: Error[] = [];
    connector.onError((error) => reported.push(error));

    client.emit("error", new Error("connection lost"));

    expect(reported.map((error) => error.message)).toEqual(["connection lost"]);
  });

  it("wraps a publish failure with the topic that failed", async () => {
    client.publish.mockRejectedValueOnce(new Error("The client is closed"));
    const connector = publisher();
    await connector.start();

    await expect(
      connector.publishTo({ topicName: "responses-4", message: "m" }),
    ).rejects.toThrow(
      '[Redis/DynamicPublisher] Failed to publish to topic "responses-4"',
    );
  });

  it("keeps the driver error as the cause", async () => {
    const driverError = new Error("The client is closed");
    client.publish.mockRejectedValueOnce(driverError);
    const connector = publisher();
    await connector.start();

    const failure = await rejectionOf(
      connector.publishTo({ topicName: "responses-4", message: "m" }),
    );

    expect(failure.cause).toBe(driverError);
  });
});
