import {
  CommandBusEmitter,
  CommandBusReceiver,
  type CommandBusConnectors,
  type CommandHandlerResponse,
  type ErrorHandler,
} from "ontologic";

import {
  handlePlaceOrder,
  parsePlaceOrder,
  type PlaceOrderCommand,
  type PlaceOrderMetadata,
} from "./domain/placeOrder";

/**
 * `CommandBusConnectors` lives in `ontologic`: the four connectors a command
 * bus needs. `InMemoryCommandBusConnectors` implements it, and so do the Redis
 * and SQS sets in `src/connectors/`.
 */
export type { CommandBusConnectors };

export type PlaceOrderEmitter = CommandBusEmitter<
  PlaceOrderCommand,
  PlaceOrderMetadata
>;

export type PlaceOrderReceiver = CommandBusReceiver<
  PlaceOrderCommand,
  PlaceOrderMetadata
>;

export interface ReceiverHooks {
  /** A command passed validation and is about to be handled. */
  onReceived?: (
    command: PlaceOrderCommand,
    metadata: PlaceOrderMetadata,
  ) => void;
  /**
   * The handler returned: this is the answer the receiver publishes next. A
   * failure to publish it is reported through the receiver's `onError`.
   * `latencyMs` is how long the handler waited before answering.
   */
  onAnswered?: (
    command: PlaceOrderCommand,
    metadata: PlaceOrderMetadata,
    answer: CommandHandlerResponse,
    latencyMs: number,
  ) => void;
  /**
   * Simulated latency: called once per command, the handler waits that many ms
   * before answering. Unset, it answers at once.
   */
  latencyMs?: () => number;
  /**
   * Registered before `start()`. That matters on Redis: with no error listener,
   * node-redis abandons its reconnect loop on the first failure.
   */
  onError?: ErrorHandler;
}

/**
 * Starts the receiving side over a connector set: it consumes commands and
 * publishes each answer to the topic the command named.
 */
export async function startReceiver(
  connectors: CommandBusConnectors,
  hooks: ReceiverHooks = {},
): Promise<PlaceOrderReceiver> {
  const receiver: PlaceOrderReceiver = new CommandBusReceiver(
    {
      commandSubscriber: connectors.commandOrderedListener,
      responsePublisher: connectors.responseDynamicPublisher,
    },
    { validator: parsePlaceOrder },
  );

  receiver.process(async (command, metadata) => {
    hooks.onReceived?.(command, metadata);

    const latencyMs = hooks.latencyMs?.() ?? 0;

    if (latencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, latencyMs));
    }

    const answer = await handlePlaceOrder(command);

    hooks.onAnswered?.(command, metadata, answer, latencyMs);

    return answer;
  });

  if (hooks.onError !== undefined) {
    receiver.onError(hooks.onError);
  }

  await receiver.start();

  return receiver;
}

/** Starts the sending side over a connector set. */
export async function startEmitter(
  connectors: CommandBusConnectors,
  options?: { timeout?: number; onError?: ErrorHandler },
): Promise<PlaceOrderEmitter> {
  const emitter: PlaceOrderEmitter = new CommandBusEmitter(
    {
      commandPublisher: connectors.commandOrderedPublisher,
      responseSubscriber: connectors.responseListener,
    },
    { timeout: options?.timeout ?? 5000 },
  );

  if (options?.onError !== undefined) {
    emitter.onError(options.onError);
  }

  await emitter.start();

  return emitter;
}

export interface PlaceOrderBus {
  emitter: PlaceOrderEmitter;
  receiver: PlaceOrderReceiver;
  stop: () => Promise<void>;
}

/**
 * Both sides in one process, over any connector set.
 *
 * Nothing here is in-memory specific: swap the connectors and the same code
 * runs over Redis or SQS. The CLI uses the two halves separately so that the
 * emitter and receiver can run as different processes.
 */
export async function startPlaceOrderBus(
  connectors: CommandBusConnectors,
  options?: { timeout?: number } & ReceiverHooks,
): Promise<PlaceOrderBus> {
  const receiver = await startReceiver(connectors, options);
  const emitter = await startEmitter(connectors, {
    ...(options?.timeout === undefined ? {} : { timeout: options.timeout }),
    ...(options?.onError === undefined ? {} : { onError: options.onError }),
  });

  return {
    emitter,
    receiver,
    stop: async () => {
      // The emitter first: it drains its in-flight commands, which needs the
      // receiver still answering.
      await emitter.stop();
      await receiver.stop();
    },
  };
}
