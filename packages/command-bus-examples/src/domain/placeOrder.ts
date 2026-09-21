import {
  err,
  ok,
  type BusCommand,
  type CommandHandlerResponse,
} from "ontologic";

/**
 * The command this example sends across the bus.
 *
 * `BusCommand` fixes the envelope — `id`, `name`, `payload`, `metadata` — and
 * leaves `payload` and `metadata` as `unknown`, so narrowing them is how a
 * command becomes yours. Everything here has to survive `JSON.stringify`, since
 * that is exactly what the bus does to it.
 */
export interface PlaceOrder extends BusCommand {
  name: "PlaceOrder";
  payload: {
    orderId: string;
    customerId: string;
    items: { sku: string; quantity: number }[];
  };
  metadata: {
    correlationId: string;
  };
}

export interface PlacedOrder {
  orderId: string;
  status: "PLACED";
  itemCount: number;
}

export function placeOrderCommand(params: {
  id: string;
  orderId: string;
  customerId: string;
  items: { sku: string; quantity: number }[];
  correlationId: string;
}): PlaceOrder {
  return {
    id: params.id,
    name: "PlaceOrder",
    payload: {
      orderId: params.orderId,
      customerId: params.customerId,
      items: params.items,
    },
    metadata: { correlationId: params.correlationId },
  };
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
  command: PlaceOrder,
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
