import { InMemoryCommandBusConnectors } from "ontologic";

import { startPlaceOrderBus } from "./commandBus";
import { placeOrderCommand } from "./domain/placeOrder";

/**
 * Runnable end to end: `pnpm example:in-memory`.
 *
 * Same code path a Redis or SQS run would take — only the connectors differ.
 */
async function main() {
  const bus = await startPlaceOrderBus(new InMemoryCommandBusConnectors());

  bus.emitter.onError((error) => {
    console.error("[emitter]", error);
  });

  bus.receiver.onError((error) => {
    console.error("[receiver]", error);
  });

  const accepted = await bus.emitter.send({
    command: placeOrderCommand({
      id: "cmd-1",
      orderId: "order-1",
      customerId: "customer-1",
      items: [
        { sku: "BOOK-1", quantity: 2 },
        { sku: "PEN-3", quantity: 1 },
      ],
      correlationId: "corr-1",
    }),
    // Commands for one order stay in order relative to each other.
    orderingKey: "order-1",
  });

  console.log(
    accepted.isOk()
      ? `accepted: ${JSON.stringify(accepted.value)}`
      : `refused: ${accepted.error.message}`,
  );

  // The handler refuses this one. A refusal travels back as an Err, not a
  // thrown error: the business said no, and that is an ordinary answer.
  const refused = await bus.emitter.send({
    command: placeOrderCommand({
      id: "cmd-2",
      orderId: "order-2",
      customerId: "customer-1",
      items: [],
      correlationId: "corr-2",
    }),
    orderingKey: "order-2",
  });

  console.log(
    refused.isOk()
      ? `accepted: ${JSON.stringify(refused.value)}`
      : `refused: ${refused.error.name}: ${refused.error.message}`,
  );

  await bus.stop();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
