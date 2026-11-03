import { describe, it, expect, vi } from "vitest";

import { CommandBusReceiver } from "../receiver";
import {
  type IDynamicPublisherConnector,
  type IOrderedListenerConnector,
  type ReceivedMessage,
} from "../../bus-connectors";
import {
  type BusCommand,
  type CommandBusResponse,
  type CommandHandler,
  type CommandMetadata,
} from "../interfaces";
import { err, ok } from "../../result";
import { Command } from "../../action";
import { DomainError } from "../../domainError";
import { commandBusResponseSchema } from "../schemas";

function command(): BusCommand {
  return {
    name: "PlaceOrder",
    payload: { orderId: "order-1" },
  };
}

function metadata(): CommandMetadata {
  return { id: "cmd-1", createdAt: "2026-01-01T00:00:00.000Z" };
}

/** Trusts the wire shape, for tests about anything but validation. */
const passThrough = (raw: unknown) => raw as BusCommand;

function receivedMessage(content: string): ReceivedMessage {
  return {
    content,
    ack: vi.fn(async () => {}),
    nack: vi.fn(async () => {}),
  };
}

/** Connectors carry strings, so every published response has to be parsed back. */
function parseResponse(message: string | undefined): CommandBusResponse {
  if (message === undefined) {
    throw new Error("Nothing was published");
  }

  return JSON.parse(message) as CommandBusResponse;
}

/**
 * Drives a receiver through a single message and returns everything the test
 * needs to assert on: the message it acked, what got published, and the errors
 * reported to `onError`.
 *
 * The two connectors below are typed as the interfaces rather than cast to
 * them. An earlier version used `as unknown as`, which is exactly why this file
 * kept compiling against a contract that no longer existed.
 */
async function processOneMessage(params: {
  content: string;
  handler: CommandHandler<BusCommand>;
  validator?: (command: unknown) => BusCommand;
  publishFails?: Error;
}) {
  const published: { topicName: string; message: string }[] = [];

  const publishTo = vi.fn(
    async (args: { topicName: string; message: string }): Promise<void> => {
      if (params.publishFails) {
        throw params.publishFails;
      }

      published.push(args);
    },
  );

  let handle: (message: ReceivedMessage) => Promise<void> = async () => {};

  const commandSubscriber: IOrderedListenerConnector = {
    kind: "ordered-listener",
    status: "STOPPED",
    start: async () => {},
    stop: async () => {},
    onError: () => {},
    checkConnection: async () => true,
    topicName: () => "commands",
    onMessage: (handler) => {
      handle = handler;
    },
  };

  const responsePublisher: IDynamicPublisherConnector = {
    kind: "dynamic-publisher",
    status: "STOPPED",
    start: async () => {},
    stop: async () => {},
    onError: () => {},
    checkConnection: async () => true,
    publishTo,
  };

  const receiver = new CommandBusReceiver<BusCommand>(
    { commandSubscriber, responsePublisher },
    { validator: params.validator ?? passThrough },
  );

  const reportedErrors: Error[] = [];
  receiver.onError((error) => reportedErrors.push(error));

  receiver.process(params.handler);

  const message = receivedMessage(params.content);
  await handle(message);

  return { message, published, reportedErrors, publishTo };
}

const validContent = JSON.stringify({
  command: command(),
  metadata: metadata(),
  responseTopicName: "responses",
});

describe("CommandBusReceiver.process", () => {
  it("publishes a SUCCESS response and acks once when the handler succeeds", async () => {
    const { message, published } = await processOneMessage({
      content: validContent,
      handler: async () => ok({ ok: true }),
    });

    expect(message.ack).toHaveBeenCalledTimes(1);
    expect(published).toHaveLength(1);
    expect(published[0]?.topicName).toBe("responses");
    expect(parseResponse(published[0]?.message)).toEqual({
      commandId: "cmd-1",
      result: "SUCCESS",
      payload: { ok: true },
    });
  });

  it("hands the handler the deserialized command", async () => {
    const seen: BusCommand[] = [];

    await processOneMessage({
      content: validContent,
      handler: async (received) => {
        seen.push(received);
        return ok(null);
      },
    });

    expect(seen).toEqual([command()]);
  });

  it("publishes a FAILURE response and acks once when the handler returns an error", async () => {
    const domainError = new Error("order already paid");
    domainError.name = "ORDER_ALREADY_PAID";

    const { message, published } = await processOneMessage({
      content: validContent,
      handler: async () => err(domainError),
    });

    expect(message.ack).toHaveBeenCalledTimes(1);

    const response = parseResponse(published[0]?.message);

    expect(response.result).toBe("FAILURE");
    expect(response).toMatchObject({
      commandId: "cmd-1",
      error: { name: "ORDER_ALREADY_PAID", message: "order already paid" },
    });
  });

  it("publishes a FAILURE response and acks once when the handler throws", async () => {
    const { message, published } = await processOneMessage({
      content: validContent,
      handler: async () => {
        throw new Error("boom");
      },
    });

    expect(message.ack).toHaveBeenCalledTimes(1);

    expect(parseResponse(published[0]?.message)).toMatchObject({
      commandId: "cmd-1",
      result: "FAILURE",
      error: {
        message: "CommandBusReceiver: Command handler threw: boom",
      },
    });
  });

  it("reports a non Error throw without leaking it", async () => {
    const { published } = await processOneMessage({
      content: validContent,
      handler: async () => {
        throw "a string";
      },
    });

    expect(parseResponse(published[0]?.message)).toMatchObject({
      result: "FAILURE",
      error: {
        message:
          "CommandBusReceiver: Command handler threw: a non Error object",
      },
    });
  });

  it("codes a returned error COMMAND_REJECTED when it carries no code", async () => {
    const { published } = await processOneMessage({
      content: validContent,
      handler: async () => err(new Error("order already paid")),
    });

    expect(parseResponse(published[0]?.message)).toMatchObject({
      error: { code: "COMMAND_REJECTED" },
    });
  });

  it("codes a thrown error HANDLER_THREW when it carries no code", async () => {
    const { published } = await processOneMessage({
      content: validContent,
      handler: async () => {
        throw new Error("boom");
      },
    });

    expect(parseResponse(published[0]?.message)).toMatchObject({
      error: { code: "HANDLER_THREW" },
    });
  });

  it("keeps the error's own code when it has one", async () => {
    const domainError = Object.assign(new Error("order already paid"), {
      code: "ALREADY_PAID",
    });

    const { published } = await processOneMessage({
      content: validContent,
      handler: async () => err(domainError),
    });

    expect(parseResponse(published[0]?.message)).toMatchObject({
      error: { code: "ALREADY_PAID" },
    });
  });

  it("carries a DomainError's context in the response", async () => {
    const domainError = new DomainError({
      name: "ORDER_ALREADY_PAID",
      message: "order already paid",
      context: { orderId: "order-1" },
    });

    const { published } = await processOneMessage({
      content: validContent,
      handler: async () => err(domainError),
    });

    expect(parseResponse(published[0]?.message)).toMatchObject({
      error: { context: { orderId: "order-1" } },
    });
  });

  it("sends a null context for an error that has none", async () => {
    const { published } = await processOneMessage({
      content: validContent,
      handler: async () => err(new Error("order already paid")),
    });

    expect(parseResponse(published[0]?.message)).toMatchObject({
      error: { context: null },
    });
  });

  it("keeps the name and stack of a thrown error", async () => {
    const thrown = new Error("boom");
    thrown.name = "PAYMENT_GATEWAY_DOWN";

    const { published } = await processOneMessage({
      content: validContent,
      handler: async () => {
        throw thrown;
      },
    });

    expect(parseResponse(published[0]?.message)).toMatchObject({
      error: { name: "PAYMENT_GATEWAY_DOWN", stack: thrown.stack },
    });
  });

  it("keeps the context of a thrown DomainError", async () => {
    const { published } = await processOneMessage({
      content: validContent,
      handler: async () => {
        throw new DomainError({
          name: "ORDER_LOCKED",
          message: "order is locked",
          context: { orderId: "order-1" },
        });
      },
    });

    expect(parseResponse(published[0]?.message)).toMatchObject({
      error: { context: { orderId: "order-1" } },
    });
  });

  it("publishes a response the emitter accepts for an error with no message", async () => {
    const { published } = await processOneMessage({
      content: validContent,
      handler: async () => err(new Error()),
    });

    const result = commandBusResponseSchema.safeParse(
      parseResponse(published[0]?.message),
    );

    expect(result.isOk()).toBe(true);
  });

  it("acks only once when publishing the response fails", async () => {
    const { message } = await processOneMessage({
      content: validContent,
      handler: async () => ok({ ok: true }),
      publishFails: new Error("broker is down"),
    });

    expect(message.ack).toHaveBeenCalledTimes(1);
  });

  it("does not attempt to publish again when publishing the response fails", async () => {
    const { publishTo } = await processOneMessage({
      content: validContent,
      handler: async () => ok({ ok: true }),
      publishFails: new Error("broker is down"),
    });

    expect(publishTo).toHaveBeenCalledTimes(1);
  });

  it("reports a publish failure as a publish failure, not a handler failure", async () => {
    const brokerError = new Error("broker is down");

    const { reportedErrors } = await processOneMessage({
      content: validContent,
      handler: async () => ok({ ok: true }),
      publishFails: brokerError,
    });

    expect(reportedErrors).toHaveLength(1);
    expect(reportedErrors[0]?.message).toBe(
      "CommandBusReceiver: Failed to publish the response of command cmd-1",
    );
    expect(reportedErrors[0]?.cause).toBe(brokerError);
  });

  it("acks and reports without publishing when the command envelope is malformed", async () => {
    const { message, published, reportedErrors } = await processOneMessage({
      content: JSON.stringify({
        command: { name: "", payload: null },
        metadata: metadata(),
        responseTopicName: "responses",
      }),
      handler: async () => ok({ ok: true }),
    });

    expect(message.ack).toHaveBeenCalledTimes(1);
    expect(published).toEqual([]);
    expect(reportedErrors[0]?.message).toBe(
      "Invalid BusCommand: name is an empty string",
    );
  });

  it("acks and reports without publishing when the metadata is malformed", async () => {
    const { message, published, reportedErrors } = await processOneMessage({
      content: JSON.stringify({
        command: command(),
        metadata: { id: "", createdAt: "2026-01-01T00:00:00.000Z" },
        responseTopicName: "responses",
      }),
      handler: async () => ok({ ok: true }),
    });

    expect(message.ack).toHaveBeenCalledTimes(1);
    expect(published).toEqual([]);
    expect(reportedErrors[0]?.message).toBe(
      "Invalid Metadata: id is an empty string",
    );
  });

  it("hands the handler the command's metadata", async () => {
    const seen: CommandMetadata[] = [];

    await processOneMessage({
      content: validContent,
      handler: async (_command, received) => {
        seen.push(received);
        return ok(null);
      },
    });

    expect(seen).toEqual([metadata()]);
  });

  it("hands the handler what the validator returned", async () => {
    class PlaceOrderCommand extends Command<"PlaceOrder", { orderId: string }> {
      constructor(payload: { orderId: string }) {
        super({ name: "PlaceOrder", payload });
      }
    }
    const seen: unknown[] = [];

    await processOneMessage({
      content: validContent,
      validator: (raw) =>
        new PlaceOrderCommand(
          (raw as { payload: { orderId: string } }).payload,
        ),
      handler: async (received) => {
        seen.push(received);
        return ok(null);
      },
    });

    expect(seen[0]).toBeInstanceOf(PlaceOrderCommand);
  });

  it("answers INVALID_COMMAND when the validator throws", async () => {
    const { published } = await processOneMessage({
      content: validContent,
      validator: () => {
        throw new Error("orderId must be a UUID");
      },
      handler: async () => ok(null),
    });

    expect(parseResponse(published[0]?.message)).toMatchObject({
      commandId: "cmd-1",
      result: "FAILURE",
      error: { code: "INVALID_COMMAND", message: "orderId must be a UUID" },
    });
  });

  it("does not run the handler when the validator throws", async () => {
    const handler = vi.fn(async () => ok(null));

    await processOneMessage({
      content: validContent,
      validator: () => {
        throw new Error("orderId must be a UUID");
      },
      handler,
    });

    expect(handler).not.toHaveBeenCalled();
  });

  it("acks once when the validator throws", async () => {
    const { message } = await processOneMessage({
      content: validContent,
      validator: () => {
        throw new Error("orderId must be a UUID");
      },
      handler: async () => ok(null),
    });

    expect(message.ack).toHaveBeenCalledTimes(1);
  });

  it("acks and reports without publishing when the content is not JSON", async () => {
    const { message, published, reportedErrors } = await processOneMessage({
      content: "not json at all",
      handler: async () => ok({ ok: true }),
    });

    expect(message.ack).toHaveBeenCalledTimes(1);
    expect(published).toEqual([]);
    expect(reportedErrors).toHaveLength(1);
    expect(reportedErrors[0]?.message).toBe(
      "Invalid command: The command cannot be parsed as JSON",
    );
    expect(reportedErrors[0]?.cause).toBeInstanceOf(SyntaxError);
  });

  it("does not run the handler when the content is not JSON", async () => {
    const handler = vi.fn(async () => ok({ ok: true }));

    await processOneMessage({ content: "not json at all", handler });

    expect(handler).not.toHaveBeenCalled();
  });
});

/**
 * A started receiver whose handler only returns when the test says so, to
 * catch it mid-command. Connector stops are recorded in order.
 */
async function startedReceiverWithSlowHandler(options?: {
  /** The command subscriber's stop never returns, like a stuck poll loop. */
  subscriberStopHangs?: boolean;
}) {
  const published: { topicName: string; message: string }[] = [];
  const stopped: string[] = [];
  const handler = vi.fn(async () => {
    await handlerReleased;
    return ok({ ok: true });
  });

  let releaseHandler: () => void = () => {};
  const handlerReleased = new Promise<void>((resolve) => {
    releaseHandler = resolve;
  });

  let handle: (message: ReceivedMessage) => Promise<void> = async () => {};

  const commandSubscriber: IOrderedListenerConnector = {
    kind: "ordered-listener",
    status: "STOPPED",
    start: async () => {},
    stop: async () => {
      stopped.push("commandSubscriber");

      if (options?.subscriberStopHangs) {
        await new Promise(() => {});
      }
    },
    onError: () => {},
    checkConnection: async () => true,
    topicName: () => "commands",
    onMessage: (messageHandler) => {
      handle = messageHandler;
    },
  };

  const responsePublisher: IDynamicPublisherConnector = {
    kind: "dynamic-publisher",
    status: "STOPPED",
    start: async () => {},
    stop: async () => {
      stopped.push("responsePublisher");
    },
    onError: () => {},
    checkConnection: async () => true,
    publishTo: async (args) => {
      published.push(args);
    },
  };

  const receiver = new CommandBusReceiver<BusCommand>(
    { commandSubscriber, responsePublisher },
    { validator: passThrough },
  );

  const reportedErrors: Error[] = [];
  receiver.onError((error) => reportedErrors.push(error));

  receiver.process(handler);
  await receiver.start();

  return {
    receiver,
    reportedErrors,
    handler,
    published,
    stopped,
    releaseHandler,
    /** Hands the receiver a message, as the broker would. Not awaited. */
    deliver: (content = validContent) => {
      const message = receivedMessage(content);
      const handling = handle(message);
      return { message, handling };
    },
  };
}

/** Lets pending promise callbacks and short timers run. */
const tick = () => new Promise((resolve) => setTimeout(resolve, 10));

describe("CommandBusReceiver.stop", () => {
  it("still publishes the response of a command being handled", async () => {
    const { receiver, published, releaseHandler, deliver } =
      await startedReceiverWithSlowHandler();

    const { handling } = deliver();
    const stopping = receiver.stop();
    releaseHandler();
    await Promise.all([handling, stopping]);

    expect(parseResponse(published[0]?.message)).toMatchObject({
      commandId: "cmd-1",
      result: "SUCCESS",
    });
  });

  it("waits for the command being handled before it resolves", async () => {
    const { receiver, releaseHandler, deliver } =
      await startedReceiverWithSlowHandler();

    deliver();
    let stopped = false;
    const stopping = receiver.stop().then(() => {
      stopped = true;
    });
    await tick();

    expect(stopped).toBe(false);

    releaseHandler();
    await stopping;
  });

  it("stops the command subscriber before the response publisher", async () => {
    const { receiver, stopped, releaseHandler, deliver } =
      await startedReceiverWithSlowHandler();

    const { handling } = deliver();
    const stopping = receiver.stop();
    releaseHandler();
    await Promise.all([handling, stopping]);

    expect(stopped).toEqual(["commandSubscriber", "responsePublisher"]);
  });

  it("nacks a command that arrives while stopping", async () => {
    const { receiver, releaseHandler, deliver } =
      await startedReceiverWithSlowHandler();

    const first = deliver();
    const stopping = receiver.stop();
    const late = deliver();
    await late.handling;
    releaseHandler();
    await Promise.all([first.handling, stopping]);

    expect(late.message.nack).toHaveBeenCalledTimes(1);
    expect(late.message.ack).not.toHaveBeenCalled();
  });

  it("does not run the handler for a command that arrives while stopping", async () => {
    const { receiver, handler, releaseHandler, deliver } =
      await startedReceiverWithSlowHandler();

    const first = deliver();
    const stopping = receiver.stop();
    const late = deliver();
    await late.handling;
    releaseHandler();
    await Promise.all([first.handling, stopping]);

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("reports STOPPED once drained", async () => {
    const { receiver, releaseHandler, deliver } =
      await startedReceiverWithSlowHandler();

    const { handling } = deliver();
    const stopping = receiver.stop();
    releaseHandler();
    await Promise.all([handling, stopping]);

    expect(receiver.status()).toBe("STOPPED");
  });

  it("does not force the stop before 2 minutes by default", async () => {
    vi.useFakeTimers();

    try {
      const { receiver, deliver } = await startedReceiverWithSlowHandler();

      deliver();
      let stopped = false;
      void receiver.stop().then(() => {
        stopped = true;
      });
      await vi.advanceTimersByTimeAsync(119_999);

      expect(stopped).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("forces the stop after 2 minutes by default", async () => {
    vi.useFakeTimers();

    try {
      const { receiver, deliver } = await startedReceiverWithSlowHandler();

      deliver();
      const stopping = receiver.stop();
      await vi.advanceTimersByTimeAsync(120_000);
      await stopping;

      expect(receiver.status()).toBe("STOPPED");
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops the response publisher when the stop is forced", async () => {
    const { receiver, stopped, deliver } =
      await startedReceiverWithSlowHandler();

    deliver();
    await receiver.stop({ timeout: 20 });

    expect(stopped).toEqual(["commandSubscriber", "responsePublisher"]);
  });

  it("reports the commands a forced stop abandoned", async () => {
    const { receiver, reportedErrors, deliver } =
      await startedReceiverWithSlowHandler();

    deliver();
    await receiver.stop({ timeout: 20 });

    expect(reportedErrors[0]?.message).toBe(
      "[CommandBusReceiver] Stop timed out after 20ms: 1 command(s) still being handled were abandoned",
    );
  });

  it("does not ack a command a forced stop abandoned", async () => {
    const { receiver, deliver } = await startedReceiverWithSlowHandler();

    const { message } = deliver();
    await receiver.stop({ timeout: 20 });

    expect(message.ack).not.toHaveBeenCalled();
  });

  it("forces the stop when the command subscriber's own stop hangs", async () => {
    const { receiver, deliver } = await startedReceiverWithSlowHandler({
      subscriberStopHangs: true,
    });

    deliver();
    await receiver.stop({ timeout: 20 });

    expect(receiver.status()).toBe("STOPPED");
  });
});
