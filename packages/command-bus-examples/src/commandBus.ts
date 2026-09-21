import {
  CommandBusEmitter,
  CommandBusReceiver,
  type IDynamicPublisherConnector,
  type IListenerConnector,
  type IOrderedListenerConnector,
  type IOrderedPublisherConnector,
} from "ontologic";

import { handlePlaceOrder, type PlaceOrder } from "./domain/placeOrder";

/**
 * The four connectors a command bus needs, in one bag.
 *
 * A command bus is two one-way channels, not one duplex one:
 *
 *   commands   emitter  --ordered publish-->  receiver   (one topic, ordered)
 *   responses  receiver --dynamic publish-->  emitter    (one topic per emitter)
 *
 * The response side is *dynamic* because the emitter names its own response
 * topic in every command it sends, and the receiver publishes back to whatever
 * name it was given. That is what lets many emitters share one receiver.
 *
 * `InMemoryCommandBusConnectors` from `ontologic` satisfies this shape, and so
 * should the Redis and SQS implementations — see `src/connectors/README.md`.
 */
export interface CommandBusConnectors {
  commandOrderedListener: IOrderedListenerConnector;
  commandOrderedPublisher: IOrderedPublisherConnector;
  responseListener: IListenerConnector;
  responseDynamicPublisher: IDynamicPublisherConnector;
}

export interface PlaceOrderBus {
  emitter: CommandBusEmitter<PlaceOrder>;
  receiver: CommandBusReceiver<PlaceOrder>;
  stop: () => Promise<void>;
}

/**
 * Wires a started emitter and receiver over any connector set.
 *
 * Nothing here is in-memory specific: swap the connectors and the same code
 * runs over Redis or SQS.
 */
export async function startPlaceOrderBus(
  connectors: CommandBusConnectors,
  options?: { timeout?: number },
): Promise<PlaceOrderBus> {
  const receiver = new CommandBusReceiver<PlaceOrder>({
    commandSubscriber: connectors.commandOrderedListener,
    responsePublisher: connectors.responseDynamicPublisher,
  });

  const emitter = new CommandBusEmitter<PlaceOrder>(
    {
      commandPublisher: connectors.commandOrderedPublisher,
      responseSubscriber: connectors.responseListener,
    },
    { timeout: options?.timeout ?? 5000 },
  );

  receiver.process(handlePlaceOrder);

  await receiver.start();
  await emitter.start();

  return {
    emitter,
    receiver,
    stop: async () => {
      await emitter.stop();
      await receiver.stop();
    },
  };
}
