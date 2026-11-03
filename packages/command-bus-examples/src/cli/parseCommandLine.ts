export type ParsedLine =
  | {
      kind: "place";
      orderId: string;
      items: { sku: string; quantity: number }[];
    }
  | { kind: "simulate"; count: number }
  | { kind: "help" }
  | { kind: "quit" }
  | { kind: "empty" }
  | { kind: "invalid"; reason: string };

export const PROMPT_HELP = `Commands:
  place <orderId> [sku:qty ...]   send a PlaceOrder command, e.g. place order-1 BOOK-1:2 PEN-3:1
                                  (no items: the handler refuses it with EMPTY_ORDER)
  simulate [count]                send <count> random orders (default 10, max 100) from all the emitters
  help                            show this help
  quit                            wait for running simulations and the answers still due, then exit`;

/** Turns one typed line into what the emitter should do with it. */
export function parseCommandLine(line: string): ParsedLine {
  const [word, ...args] = line.trim().split(/\s+/).filter(Boolean);

  switch (word) {
    case undefined:
      return { kind: "empty" };

    case "help":
    case "?":
      return { kind: "help" };

    case "quit":
    case "exit":
      return { kind: "quit" };

    case "place":
      return parsePlace(args);

    case "simulate":
      return parseSimulate(args);

    default:
      return {
        kind: "invalid",
        reason: `Unknown command "${word}". Type help to see the commands`,
      };
  }
}

function parsePlace(args: string[]): ParsedLine {
  const [orderId, ...itemArgs] = args;

  if (orderId === undefined) {
    return {
      kind: "invalid",
      reason: "place needs an order id: place <orderId> [sku:qty ...]",
    };
  }

  const items: { sku: string; quantity: number }[] = [];

  for (const itemArg of itemArgs) {
    const match = /^([^:]+):(\d+)$/.exec(itemArg);
    const quantity = Number(match?.[2]);

    if (match?.[1] === undefined || quantity < 1) {
      return {
        kind: "invalid",
        reason: `"${itemArg}" is not an item: write it sku:qty, e.g. BOOK-1:2`,
      };
    }

    items.push({ sku: match[1], quantity });
  }

  return { kind: "place", orderId, items };
}

export const DEFAULT_SIMULATION_COUNT = 10;
export const MAX_SIMULATION_COUNT = 100;

function parseSimulate(args: string[]): ParsedLine {
  const [countArg, ...rest] = args;

  if (rest.length > 0) {
    return {
      kind: "invalid",
      reason: "simulate takes one count: simulate [count]",
    };
  }

  if (countArg === undefined) {
    return { kind: "simulate", count: DEFAULT_SIMULATION_COUNT };
  }

  const count = Number(countArg);

  if (!Number.isInteger(count) || count < 1 || count > MAX_SIMULATION_COUNT) {
    return {
      kind: "invalid",
      reason: `simulate needs a count between 1 and ${MAX_SIMULATION_COUNT}, got "${countArg}"`,
    };
  }

  return { kind: "simulate", count };
}
