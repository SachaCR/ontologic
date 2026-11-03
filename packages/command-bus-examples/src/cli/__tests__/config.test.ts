import { describe, it, expect } from "vitest";

import { parseCliArgs, UsageError } from "../config";

describe("parseCliArgs", () => {
  it("defaults to 3 emitters and 3 receivers over sqs", () => {
    expect(parseCliArgs([], {})).toEqual({
      role: "both",
      transport: "sqs",
      instances: 3,
      timeout: 10000,
      latency: { minMs: 500, maxMs: 3000 },
      redisUrl: "redis://127.0.0.1:6379",
      commandTopic: "place-order-commands.fifo",
      region: "us-east-1",
    });
  });

  it("reads the role and the transport", () => {
    expect(
      parseCliArgs(["receiver", "--transport", "redis"], {}),
    ).toMatchObject({ role: "receiver", transport: "redis" });
  });

  it("ignores the -- that pnpm forwards", () => {
    expect(
      parseCliArgs(["--", "emitter", "--transport", "redis"], {}),
    ).toMatchObject({ role: "emitter", transport: "redis" });
  });

  it("reads the number of instances", () => {
    expect(parseCliArgs(["--instances", "5"], {})).toMatchObject({
      instances: 5,
    });
  });

  it("reads the timeout", () => {
    expect(parseCliArgs(["--timeout", "200"], {})).toMatchObject({
      timeout: 200,
    });
  });

  it("reads the latency range", () => {
    expect(parseCliArgs(["--latency", "0-100"], {})).toMatchObject({
      latency: { minMs: 0, maxMs: 100 },
    });
  });

  it("reads the connection settings from the environment", () => {
    expect(
      parseCliArgs([], {
        REDIS_URL: "redis://redis:6379",
        SQS_ENDPOINT: "http://localhost:4566",
        AWS_REGION: "eu-west-3",
        COMMAND_TOPIC: "orders",
      }),
    ).toMatchObject({
      redisUrl: "redis://redis:6379",
      sqsEndpoint: "http://localhost:4566",
      region: "eu-west-3",
      commandTopic: "orders.fifo",
    });
  });

  it("keeps the command topic as it is for redis", () => {
    expect(parseCliArgs(["--transport", "redis"], {})).toMatchObject({
      commandTopic: "place-order-commands",
    });
  });

  it("does not add .fifo twice", () => {
    expect(parseCliArgs([], { COMMAND_TOPIC: "orders.fifo" })).toMatchObject({
      commandTopic: "orders.fifo",
    });
  });

  it("leaves sqsEndpoint out when it is empty", () => {
    expect(parseCliArgs([], { SQS_ENDPOINT: "" })).not.toHaveProperty(
      "sqsEndpoint",
    );
  });

  it("asks for help", () => {
    expect(parseCliArgs(["--help"], {})).toEqual({ help: true });
  });

  it("refuses the in-memory transport", () => {
    expect(() => parseCliArgs(["--transport", "in-memory"], {})).toThrow(
      'Unknown transport "in-memory", expected one of: redis, sqs',
    );
  });

  it("refuses an unknown role", () => {
    expect(() => parseCliArgs(["sender"], {})).toThrow(
      'Unknown role "sender", expected one of: emitter, receiver, both',
    );
  });

  it("refuses an unknown option as a usage error", () => {
    expect(() => parseCliArgs(["--verbose"], {})).toThrow(UsageError);
  });

  it("refuses zero instances", () => {
    expect(() => parseCliArgs(["--instances", "0"], {})).toThrow(
      '--instances must be a whole number of at least 1, got "0"',
    );
  });

  it("refuses a latency that is not a range", () => {
    expect(() => parseCliArgs(["--latency", "500"], {})).toThrow(
      '--latency must be a range of ms like 500-3000, got "500"',
    );
  });

  it("refuses a latency range upside down", () => {
    expect(() => parseCliArgs(["--latency", "3000-500"], {})).toThrow(
      UsageError,
    );
  });
});
