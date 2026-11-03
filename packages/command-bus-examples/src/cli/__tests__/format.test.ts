import { describe, it, expect } from "vitest";
import { err, ok } from "ontologic";

import {
  answeredLine,
  answerLine,
  emitterLabel,
  notSentLine,
  receivedLine,
  receiverLabel,
  sentLine,
} from "../format";
import { placeOrder } from "../../domain/placeOrder";

const ID = "3f2a91c4-0000-4000-8000-000000000000";

function wireError(code: string, name: string, message: string): Error {
  const error = new Error(message);
  error.name = name;
  error.cause = { code };
  return error;
}

const { command, metadata } = placeOrder({
  id: ID,
  orderId: "order-1",
  customerId: "customer-1",
  items: [],
  correlationId: "corr-1",
});

describe("labels", () => {
  it("numbers emitters from 1", () => {
    expect(emitterLabel(0)).toBe("[emitter-1]");
  });

  it("numbers receivers from 1", () => {
    expect(receiverLabel(2)).toBe("[receiver-3]");
  });
});

describe("emitter lines", () => {
  it("announces a sent command by its short id and order", () => {
    expect(sentLine("[emitter-1]", ID, "order-1")).toBe(
      "[emitter-1] → sent cmd 3f2a91c4 (order-1)",
    );
  });

  it("prints an accepted answer with its payload", () => {
    expect(answerLine("[emitter-1]", ID, ok({ status: "PLACED" }), 12)).toBe(
      '[emitter-1] ← cmd 3f2a91c4 accepted in 12ms: {"status":"PLACED"}',
    );
  });

  it("prints a business refusal by its name", () => {
    expect(
      answerLine(
        "[emitter-2]",
        ID,
        err(wireError("COMMAND_REJECTED", "EMPTY_ORDER", "no item")),
        9,
      ),
    ).toBe("[emitter-2] ← cmd 3f2a91c4 refused in 9ms: EMPTY_ORDER: no item");
  });

  it("prints any other failure by its code", () => {
    expect(
      answerLine(
        "[emitter-3]",
        ID,
        err(wireError("COMMAND_TIMEOUT", "TIMEOUT_ERROR", "too slow")),
        10000,
      ),
    ).toBe(
      "[emitter-3] ← cmd 3f2a91c4 failed after 10000ms: COMMAND_TIMEOUT: too slow",
    );
  });

  it("prints a command that could not be sent", () => {
    expect(notSentLine("[emitter-1]", ID, new Error("broker down"))).toBe(
      "[emitter-1] ✗ cmd 3f2a91c4 not sent: broker down",
    );
  });
});

describe("receiver lines", () => {
  it("logs a received command", () => {
    expect(receivedLine("[receiver-1]", command, metadata)).toBe(
      "[receiver-1] received PLACE_ORDER cmd 3f2a91c4 (order-1, correlation corr-1)",
    );
  });

  it("logs a successful answer with its latency", () => {
    expect(answeredLine("[receiver-2]", metadata, ok(null), 1834)).toBe(
      "[receiver-2] answered cmd 3f2a91c4 after 1834ms: SUCCESS",
    );
  });

  it("logs a refusal by its name", () => {
    const refusal = new Error("no item");
    refusal.name = "EMPTY_ORDER";

    expect(answeredLine("[receiver-1]", metadata, err(refusal), 600)).toBe(
      "[receiver-1] answered cmd 3f2a91c4 after 600ms: FAILURE EMPTY_ORDER",
    );
  });
});
