import {
  Command,
  err,
  ok,
  type CommandHandlerResponse,
  type CommandMetadata,
} from "ontologic";

export interface PlaceOrderPayload {
  orderId: string;
  customerId: string;
  items: { sku: string; quantity: number }[];
}

/**
 * The command this example sends across the bus.
 *
 * It is an ordinary use-case `Command`, the same class a use case would take
 * in-process: the bus carries it as it is. Everything in the payload has to
 * survive `JSON.stringify`, since that is exactly what the bus does to it.
 */
export class PlaceOrderCommand extends Command<
  "PLACE_ORDER",
  PlaceOrderPayload
> {
  constructor(payload: PlaceOrderPayload) {
    super({ name: "PLACE_ORDER", payload });
  }
}

/**
 * Travels next to the command, like `EventMetadata` next to an event. `id`
 * identifies this command; the rest is up to the application.
 */
export interface PlaceOrderMetadata extends CommandMetadata {
  correlationId: string;
}

/** A command and its metadata, ready to spread into `emitter.send`. */
export function placeOrder(params: {
  id: string;
  orderId: string;
  customerId: string;
  items: { sku: string; quantity: number }[];
  correlationId: string;
}): { command: PlaceOrderCommand; metadata: PlaceOrderMetadata } {
  return {
    command: new PlaceOrderCommand({
      orderId: params.orderId,
      customerId: params.customerId,
      items: params.items,
    }),
    metadata: {
      id: params.id,
      createdAt: new Date().toISOString(),
      correlationId: params.correlationId,
    },
  };
}

/**
 * The receiver's validator. A command arrives as plain JSON; this checks it
 * and turns it back into a `PlaceOrderCommand`. If it throws, the emitter gets
 * an `INVALID_COMMAND` failure and the handler never runs.
 */
export function parsePlaceOrder(raw: unknown): PlaceOrderCommand {
  const { name, payload } = (raw ?? {}) as {
    name?: unknown;
    payload?: Partial<PlaceOrderPayload>;
  };

  if (name !== "PLACE_ORDER") {
    throw new Error(`Expected a PLACE_ORDER command, got ${String(name)}`);
  }

  if (
    typeof payload?.orderId !== "string" ||
    typeof payload.customerId !== "string" ||
    !Array.isArray(payload.items)
  ) {
    throw new Error("PLACE_ORDER: invalid payload");
  }

  return new PlaceOrderCommand({
    orderId: payload.orderId,
    customerId: payload.customerId,
    items: payload.items,
  });
}

export interface PlacedOrder {
  orderId: string;
  status: "PLACED";
  itemCount: number;
}

/**
 * The receiving side.
 *
 * A command handler returns a `Result`: a business refusal is a value, not an
 * exception. The bus serializes an `Err` into a FAILURE response and the
 * emitter hands it back as an `Err` on the other side, so the caller sees the
 * same refusal it would have seen from an in-process call.
 *
 * Throwing works too — the receiver catches it and reports it as a failure —
 * but that is for the genuinely unexpected.
 */
export async function handlePlaceOrder(
  command: PlaceOrderCommand,
): Promise<CommandHandlerResponse> {
  const { orderId, items } = command.payload;

  if (items.length === 0) {
    return err(new EmptyOrderError(orderId));
  }

  const placed: PlacedOrder = {
    orderId,
    status: "PLACED",
    itemCount: items.reduce((total, item) => total + item.quantity, 0),
  };

  return ok(placed);
}

export class EmptyOrderError extends Error {
  constructor(orderId: string) {
    super(`Order ${orderId} has no item`);
    this.name = "EMPTY_ORDER";
    Object.setPrototypeOf(this, EmptyOrderError.prototype);
  }
}
