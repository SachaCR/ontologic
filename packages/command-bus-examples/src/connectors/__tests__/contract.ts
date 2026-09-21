import { describe, it, expect } from "vitest";

import {
  startPlaceOrderBus,
  type CommandBusConnectors,
} from "../../commandBus";
import { placeOrderCommand } from "../../domain/placeOrder";

export interface ConnectorContractHarness {
  /** A fresh, unstarted connector set. Called once per test. */
  create: () => Promise<CommandBusConnectors> | CommandBusConnectors;
  /** Release whatever `create` opened. */
  destroy?: (connectors: CommandBusConnectors) => Promise<void> | void;
  /** Round-trip budget. The default suits an in-process fake; raise it for a broker. */
  timeout?: number;
}

/**
 * The behaviour every command bus connector set has to exhibit, independent of
 * transport.
 *
 * Point this at a new implementation and it either passes or tells you which
 * part of the contract it broke. The assertions are deliberately about observable
 * round-trip behaviour rather than internals, because that is all the buses
 * depend on: connectors carry opaque strings, and the two buses do every bit of
 * the serializing.
 */
export function testCommandBusConnectors(
  name: string,
  harness: ConnectorContractHarness,
): void {
  const timeout = harness.timeout ?? 2000;

  async function withBus<T>(
    use: (bus: Awaited<ReturnType<typeof startPlaceOrderBus>>) => Promise<T>,
  ): Promise<T> {
    const connectors = await harness.create();
    const bus = await startPlaceOrderBus(connectors, { timeout });

    try {
      return await use(bus);
    } finally {
      await bus.stop();
      await harness.destroy?.(connectors);
    }
  }

  describe(`command bus contract: ${name}`, () => {
    it("carries a command to the handler and its result back", async () => {
      const result = await withBus((bus) =>
        bus.emitter.send({
          command: placeOrderCommand({
            id: "cmd-1",
            orderId: "order-1",
            customerId: "customer-1",
            items: [{ sku: "BOOK-1", quantity: 2 }],
            correlationId: "corr-1",
          }),
          orderingKey: "order-1",
        }),
      );

      expect(result._unsafeUnwrap()).toEqual({
        orderId: "order-1",
        status: "PLACED",
        itemCount: 2,
      });
    });

    it("carries a refusal back as an error, name and message intact", async () => {
      const result = await withBus((bus) =>
        bus.emitter.send({
          command: placeOrderCommand({
            id: "cmd-2",
            orderId: "order-2",
            customerId: "customer-1",
            items: [],
            correlationId: "corr-2",
          }),
          orderingKey: "order-2",
        }),
      );

      const error = result._unsafeUnwrapErr();

      expect(error.name).toBe("EMPTY_ORDER");
      expect(error.message).toBe("Order order-2 has no item");
    });

    it("routes each response back to the command that asked for it", async () => {
      // The one a real broker is most likely to get wrong. Two commands are in
      // flight at once, and each caller has to receive its own answer — the bus
      // correlates on commandId, so a connector that reorders or duplicates is
      // caught here rather than in production.
      const results = await withBus((bus) =>
        Promise.all(
          ["a", "b", "c"].map((suffix, index) =>
            bus.emitter.send({
              command: placeOrderCommand({
                id: `cmd-${suffix}`,
                orderId: `order-${suffix}`,
                customerId: "customer-1",
                items: [{ sku: "BOOK-1", quantity: index + 1 }],
                correlationId: `corr-${suffix}`,
              }),
              orderingKey: `order-${suffix}`,
            }),
          ),
        ),
      );

      expect(results.map((result) => result._unsafeUnwrap())).toEqual([
        { orderId: "order-a", status: "PLACED", itemCount: 1 },
        { orderId: "order-b", status: "PLACED", itemCount: 2 },
        { orderId: "order-c", status: "PLACED", itemCount: 3 },
      ]);
    });
  });
}
