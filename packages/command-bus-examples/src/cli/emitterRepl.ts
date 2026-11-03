import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline";
import { type Readable, type Writable } from "node:stream";

import { type PlaceOrderEmitter } from "../commandBus";
import { placeOrder } from "../domain/placeOrder";
import { type Paint } from "./colors";
import { answerLine, notSentLine, sentLine } from "./format";
import { parseCommandLine, PROMPT_HELP } from "./parseCommandLine";
import { planSimulation, type SimulatedOrder } from "./simulation";

/** One emitter instance, as the prompt drives it. */
export interface PromptEmitter {
  label: string;
  emitter: Pick<PlaceOrderEmitter, "send">;
  paint: Paint;
}

export interface EmitterReplParams {
  emitters: readonly PromptEmitter[];
  input: Readable;
  output: Writable & { isTTY?: boolean };
  /** Injectable for tests. */
  newId?: () => string;
  now?: () => number;
  plan?: (count: number, emitters: number) => SimulatedOrder[];
  sleep?: (ms: number) => Promise<void>;
}

/**
 * The interactive prompt, in front of one or more emitters.
 *
 * `place` sends from the next emitter in turn; `simulate` sends random orders
 * from all of them. Sending never blocks the prompt: commands stay in flight
 * and each answer is printed, in its emitter's color, as it comes back.
 * Resolves once the input ends (`quit`, Ctrl+C, Ctrl+D or the end of a pipe)
 * and every answer still due has arrived or timed out.
 */
export function runEmitterRepl(params: EmitterReplParams): Promise<void> {
  const { emitters, input, output } = params;
  const newId = params.newId ?? randomUUID;
  const now = params.now ?? Date.now;
  const plan = params.plan ?? planSimulation;
  const sleep =
    params.sleep ??
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  if (emitters.length === 0) {
    throw new Error("runEmitterRepl needs at least one emitter");
  }

  /** Sends, and simulations still sending, that `quit` has to wait for. */
  const inFlight = new Set<Promise<void>>();
  /** Once the input is closed, answers still print, the prompt no longer does. */
  let closed = false;
  let nextEmitter = 0;

  const rl = createInterface({
    input,
    output,
    prompt: "> ",
    terminal: output.isTTY === true,
  });

  function print(line: string): void {
    output.write(`${line}\n`);
  }

  function track(work: Promise<void>): void {
    const tracked = work.finally(() => {
      inFlight.delete(tracked);

      if (!closed) {
        rl.prompt(true);
      }
    });

    inFlight.add(tracked);
  }

  function send(
    from: PromptEmitter,
    orderId: string,
    items: { sku: string; quantity: number }[],
  ): Promise<void> {
    const id = newId();
    const { command, metadata } = placeOrder({
      id,
      orderId,
      customerId: "cli-customer",
      items,
      correlationId: `corr-${id.slice(0, 8)}`,
    });
    const startedAt = now();

    print(from.paint(sentLine(from.label, id, orderId)));

    return from.emitter.send({ command, metadata, orderingKey: orderId }).then(
      (result) =>
        print(
          from.paint(answerLine(from.label, id, result, now() - startedAt)),
        ),
      (error: unknown) => print(from.paint(notSentLine(from.label, id, error))),
    );
  }

  /** The next emitter in turn, for commands typed by hand. */
  function roundRobin(): PromptEmitter {
    const from = emitters[nextEmitter % emitters.length] as PromptEmitter;
    nextEmitter += 1;

    return from;
  }

  async function simulate(count: number): Promise<void> {
    const sends: Promise<void>[] = [];

    print(`Simulating ${count} orders from ${emitters.length} emitter(s)...`);

    for (const order of plan(count, emitters.length)) {
      // Runs to the end even after quit: `simulate 20` piped in with a quit
      // behind it still sends its twenty orders, and quit waits for them.
      await sleep(order.delayMs);

      const from = emitters[order.emitter % emitters.length] as PromptEmitter;
      sends.push(send(from, order.orderId, order.items));
    }

    await Promise.allSettled(sends);
  }

  return new Promise((resolve) => {
    rl.on("line", (line) => {
      // readline still emits the rest of a chunk after close(): lines piped in
      // behind a quit must not be sent.
      if (closed) {
        return;
      }

      const parsed = parseCommandLine(line);

      switch (parsed.kind) {
        case "place":
          track(send(roundRobin(), parsed.orderId, parsed.items));
          break;
        case "simulate":
          track(simulate(parsed.count));
          break;
        case "help":
          print(PROMPT_HELP);
          break;
        case "invalid":
          print(parsed.reason);
          break;
        case "quit":
          closed = true;
          rl.close();
          return;
        case "empty":
          break;
      }

      rl.prompt();
    });

    // Ctrl+C on a terminal: quit like `quit` does, answers still due included.
    rl.on("SIGINT", () => rl.close());

    rl.on("close", () => {
      closed = true;
      void waitForAll().then(() => resolve());
    });

    print(PROMPT_HELP);
    rl.prompt();
  });

  /** Waits until nothing is in flight, including sends started meanwhile. */
  async function waitForAll(): Promise<void> {
    while (inFlight.size > 0) {
      await Promise.allSettled([...inFlight]);
    }
  }
}
