import { describe, it, expect } from "vitest";

import { InMemoryCommandBusConnectors } from "../../bus-connectors";
import { CommandBusEmitter } from "../emitter";
import { CommandBusReceiver } from "../receiver";
import {
  type BusCommand,
  type CommandHandler,
  type CommandMetadata,
} from "../interfaces";
import { Command } from "../../action";
import { err, ok } from "../../result";

function command(overrides?: Partial<BusCommand>): BusCommand {
  return {
    name: "PlaceOrder",
    payload: { orderId: "order-1" },
    ...overrides,
  };
}

function metadata(): CommandMetadata {
  return { id: "cmd-1", createdAt: "2026-01-01T00:00:00.000Z" };
}

class PlaceOrderCommand extends Command<"PLACE_ORDER", { orderId: string }> {
  constructor(payload: { orderId: string }) {
    super({ name: "PLACE_ORDER", payload });
  }
}

/**
 * A real emitter and a real receiver over the in-memory connectors, so both
 * ends serialize and deserialize for real.
 *
 * That matters: the connectors move opaque strings, and every stubbed test in
 * this directory hands the receiver a value it built itself. Only here does the
 * string one side writes have to be the string the other side reads.
 */
async function rig(params: {
  handler: CommandHandler<BusCommand>;
  validator?: (command: unknown) => BusCommand;
  /** Left stopped to exercise the timeout: nothing consumes the command. */
  startReceiver?: boolean;
  timeout?: number;
}) {
  const connectors = new InMemoryCommandBusConnectors();

  const receiver = new CommandBusReceiver<BusCommand>(
    {
      commandSubscriber: connectors.commandOrderedListener,
      responsePublisher: connectors.responseDynamicPublisher,
    },
    { validator: params.validator ?? ((raw) => raw as BusCommand) },
  );

  const emitter = new CommandBusEmitter<BusCommand>(
    {
      commandPublisher: connectors.commandOrderedPublisher,
      responseSubscriber: connectors.responseListener,
    },
    { timeout: params.timeout ?? 1000 },
  );

  receiver.process(params.handler);

  if (params.startReceiver !== false) {
    await receiver.start();
  }

  await emitter.start();

  return { emitter, receiver };
}

describe("command bus round trip", () => {
  it("resolves with the handler payload", async () => {
    const { emitter } = await rig({
      handler: async () => ok({ orderId: "order-1", status: "PLACED" }),
    });

    const result = await emitter.send({
      command: command(),
      metadata: metadata(),
      orderingKey: "order-1",
    });

    expect(result._unsafeUnwrap()).toEqual({
      orderId: "order-1",
      status: "PLACED",
    });
  });

  it("delivers the command to the handler intact across the wire", async () => {
    const seen: BusCommand[] = [];

    const { emitter } = await rig({
      handler: async (received) => {
        seen.push(received);
        return ok(null);
      },
    });

    await emitter.send({
      command: command(),
      metadata: metadata(),
      orderingKey: "order-1",
    });

    expect(seen).toEqual([command()]);
  });

  it("delivers a use-case Command as an instance of its class", async () => {
    const seen: unknown[] = [];
    const { emitter } = await rig({
      validator: (raw) =>
        new PlaceOrderCommand((raw as PlaceOrderCommand).payload),
      handler: async (received) => {
        seen.push(received);
        return ok(null);
      },
    });

    await emitter.send({
      command: new PlaceOrderCommand({ orderId: "order-1" }),
      metadata: metadata(),
      orderingKey: "order-1",
    });

    expect(seen[0]).toBeInstanceOf(PlaceOrderCommand);
  });

  it("delivers the command's payload intact", async () => {
    const seen: PlaceOrderCommand[] = [];
    const { emitter } = await rig({
      validator: (raw) =>
        new PlaceOrderCommand((raw as PlaceOrderCommand).payload),
      handler: async (received) => {
        seen.push(received as PlaceOrderCommand);
        return ok(null);
      },
    });

    await emitter.send({
      command: new PlaceOrderCommand({ orderId: "order-1" }),
      metadata: metadata(),
      orderingKey: "order-1",
    });

    expect(seen[0]?.payload).toEqual({ orderId: "order-1" });
  });

  it("delivers the metadata next to the command", async () => {
    const seen: CommandMetadata[] = [];
    const { emitter } = await rig({
      handler: async (_command, received) => {
        seen.push(received);
        return ok(null);
      },
    });

    await emitter.send({
      command: command(),
      metadata: metadata(),
      orderingKey: "order-1",
    });

    expect(seen).toEqual([metadata()]);
  });

  it("returns INVALID_COMMAND when the receiver's validator refuses it", async () => {
    const { emitter } = await rig({
      validator: () => {
        throw new Error("orderId must be a UUID");
      },
      handler: async () => ok(null),
    });

    const result = await emitter.send({
      command: command(),
      metadata: metadata(),
      orderingKey: "order-1",
    });

    expect(result._unsafeUnwrapErr().cause).toMatchObject({
      code: "INVALID_COMMAND",
    });
  });

  it("returns the handler's domain error", async () => {
    const domainError = new Error("order already paid");
    domainError.name = "ORDER_ALREADY_PAID";

    const { emitter } = await rig({ handler: async () => err(domainError) });

    const result = await emitter.send({
      command: command(),
      metadata: metadata(),
      orderingKey: "order-1",
    });

    const error = result._unsafeUnwrapErr();

    expect(error.name).toBe("ORDER_ALREADY_PAID");
    expect(error.message).toBe("order already paid");
  });

  it("returns an error when the handler throws", async () => {
    const { emitter } = await rig({
      handler: async () => {
        throw new Error("boom");
      },
    });

    const result = await emitter.send({
      command: command(),
      metadata: metadata(),
      orderingKey: "order-1",
    });

    expect(result._unsafeUnwrapErr().message).toBe(
      "CommandBusReceiver: Command handler threw: boom",
    );
  });

  it("times out when nothing consumes the command", async () => {
    const { emitter } = await rig({
      handler: async () => ok(null),
      startReceiver: false,
      timeout: 20,
    });

    const result = await emitter.send({
      command: command(),
      metadata: metadata(),
      orderingKey: "order-1",
    });

    const error = result._unsafeUnwrapErr();

    expect(error.name).toBe("TIMEOUT_ERROR");
    expect(error.message).toContain("exceeded the expected timeout (20ms)");
  });

  it("clears the command from the in-flight map once it settles", async () => {
    const { emitter } = await rig({ handler: async () => ok(null) });

    await emitter.send({
      command: command(),
      metadata: metadata(),
      orderingKey: "order-1",
    });

    expect(emitter.metrics().inFlightCommands).toBe(0);
  });
});
