import {
  CommandBusEmitter,
  CommandBusReceiver,
  type CommandBusConnectors,
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
 * and SQS sets in `src/connectors/__tests__/`.
 */
export type { CommandBusConnectors };

export interface PlaceOrderBus {
  emitter: CommandBusEmitter<PlaceOrderCommand, PlaceOrderMetadata>;
  receiver: CommandBusReceiver<PlaceOrderCommand, PlaceOrderMetadata>;
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
  const receiver = new CommandBusReceiver<
    PlaceOrderCommand,
    PlaceOrderMetadata
  >(
    {
      commandSubscriber: connectors.commandOrderedListener,
      responsePublisher: connectors.responseDynamicPublisher,
    },
    { validator: parsePlaceOrder },
  );

  const emitter = new CommandBusEmitter<PlaceOrderCommand, PlaceOrderMetadata>(
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
