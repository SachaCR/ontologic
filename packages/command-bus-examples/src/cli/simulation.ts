export interface SimulatedOrder {
  /** Which emitter sends it, 0-based. */
  emitter: number;
  orderId: string;
  items: { sku: string; quantity: number }[];
  /** Wait before sending it, after the previous one, in ms. */
  delayMs: number;
}

const SKUS = ["BOOK-1", "PEN-3", "MUG-7", "LAMP-2", "DESK-9"];

/**
 * A small pool of order ids, so several simulated commands land on the same
 * order: those stay in order (on SQS), while different orders run in parallel.
 */
const ORDER_POOL_SIZE = 6;

/** About one order in seven is empty, to see the handler refuse it. */
const EMPTY_ORDER_RATE = 0.15;

/** Spacing between two sends, so the answers interleave with new commands. */
const MAX_SPACING_MS = 300;

/**
 * Plans `count` random orders spread across `emitters` emitters. `random` is
 * injectable so tests can pin the plan; it defaults to `Math.random`.
 */
export function planSimulation(
  count: number,
  emitters: number,
  random: () => number = Math.random,
): SimulatedOrder[] {
  const pick = (n: number) => Math.min(n - 1, Math.floor(random() * n));

  return Array.from({ length: count }, () => {
    const emitter = pick(emitters);
    const orderId = `order-${pick(ORDER_POOL_SIZE) + 1}`;
    const empty = random() < EMPTY_ORDER_RATE;
    const itemCount = empty ? 0 : pick(3) + 1;

    const items = Array.from({ length: itemCount }, () => ({
      sku: SKUS[pick(SKUS.length)] ?? "BOOK-1",
      quantity: pick(5) + 1,
    }));

    return {
      emitter,
      orderId,
      items,
      delayMs: pick(MAX_SPACING_MS + 1),
    };
  });
}

/** A random latency in [minMs, maxMs]. */
export function randomLatency(
  minMs: number,
  maxMs: number,
  random: () => number = Math.random,
): number {
  return minMs + Math.floor(random() * (maxMs - minMs + 1));
}
