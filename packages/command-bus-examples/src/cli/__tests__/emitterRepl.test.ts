import { afterEach, describe, it, expect, vi } from "vitest";
import { PassThrough, Writable } from "node:stream";
import { InMemoryCommandBusConnectors } from "ontologic";

import {
  startEmitter,
  startPlaceOrderBus,
  type PlaceOrderBus,
} from "../../commandBus";
import { runEmitterRepl, type PromptEmitter } from "../emitterRepl";
import { type SimulatedOrder } from "../simulation";

/** Collects everything written to it. */
function capture() {
  let text = "";
  const output = new Writable({
    write(chunk, _encoding, callback) {
      text += String(chunk);
      callback();
    },
  });
  return { output, text: () => text };
}

let ids = 0;
const newId = () => {
  ids += 1;
  return `cmd${String(ids).padStart(5, "0")}-0000`;
};

let buses: PlaceOrderBus[] = [];

afterEach(async () => {
  await Promise.all(buses.map((bus) => bus.stop()));
  buses = [];
});

/**
 * `count` emitters, each on its own in-memory bus with its own receiver. One
 * in-memory bus per emitter keeps each emitter's answers its own.
 */
async function promptEmitters(count: number): Promise<PromptEmitter[]> {
  const emitters: PromptEmitter[] = [];

  for (let index = 0; index < count; index += 1) {
    const bus = await startPlaceOrderBus(new InMemoryCommandBusConnectors(), {
      timeout: 1000,
    });
    buses.push(bus);
    emitters.push({
      label: `[emitter-${index + 1}]`,
      emitter: bus.emitter,
      paint: (text) => text,
    });
  }

  return emitters;
}

/** Types `lines` into the prompt, ends the input, waits for it to finish. */
async function type(
  emitters: PromptEmitter[],
  lines: string[],
  extra?: { plan?: (count: number, emitters: number) => SimulatedOrder[] },
) {
  const input = new PassThrough();
  const { output, text } = capture();

  const repl = runEmitterRepl({
    emitters,
    input,
    output,
    newId,
    sleep: async () => {},
    ...extra,
  });
  input.end(lines.map((line) => `${line}\n`).join(""));
  await repl;

  return text();
}

describe("runEmitterRepl: place", () => {
  it("prints the answer to an accepted order", async () => {
    const text = await type(await promptEmitters(1), [
      "place order-1 BOOK-1:2",
    ]);

    expect(text).toContain(
      '{"orderId":"order-1","status":"PLACED","itemCount":2}',
    );
  });

  it("says the order was accepted, by which emitter", async () => {
    const text = await type(await promptEmitters(1), [
      "place order-1 BOOK-1:2",
    ]);

    expect(text).toMatch(/\[emitter-1\] ← cmd cmd\d{5} accepted in \d+ms/);
  });

  it("prints a refusal for an order with no item", async () => {
    const text = await type(await promptEmitters(1), ["place order-2"]);

    expect(text).toMatch(
      /← cmd cmd\d{5} refused in \d+ms: EMPTY_ORDER: Order order-2 has no item/,
    );
  });

  it("sends typed commands from each emitter in turn", async () => {
    const text = await type(await promptEmitters(2), [
      "place order-1 BOOK-1:1",
      "place order-2 BOOK-1:1",
    ]);

    expect(text).toMatch(
      /\[emitter-1\] → sent .*\(order-1\)[\s\S]*\[emitter-2\] → sent .*\(order-2\)/,
    );
  });

  it("paints each line in its emitter's color", async () => {
    const [emitter] = await promptEmitters(1);
    const painted = {
      ...(emitter as PromptEmitter),
      paint: (t: string) => `<${t}>`,
    };

    const text = await type([painted], ["place order-1 BOOK-1:1"]);

    expect(text).toMatch(/<\[emitter-1\] → sent cmd cmd\d{5} \(order-1\)>/);
  });

  it("puts the order id in the ordering key", async () => {
    const send = vi.fn(async (_params: unknown) => {
      throw new Error("not under test");
    });

    await type(
      [{ label: "[e]", emitter: { send }, paint: (t) => t }],
      ["place order-7 BOOK-1:1"],
    );

    expect(send.mock.calls[0]?.[0]).toMatchObject({ orderingKey: "order-7" });
  });

  it("reports a command that could not be sent", async () => {
    const send = vi.fn(async () => {
      throw new Error("broker unreachable");
    });

    const text = await type(
      [{ label: "[e]", emitter: { send }, paint: (t) => t }],
      ["place order-1 BOOK-1:1"],
    );

    expect(text).toMatch(/\[e\] ✗ cmd cmd\d{5} not sent: broker unreachable/);
  });

  it("reports a command nobody answers as a timeout", async () => {
    const emitter = await startEmitter(new InMemoryCommandBusConnectors(), {
      timeout: 30,
    });

    const text = await type(
      [{ label: "[e]", emitter, paint: (t) => t }],
      ["place order-1 BOOK-1:1"],
    );
    await emitter.stop();

    expect(text).toMatch(/failed after \d+ms: COMMAND_TIMEOUT/);
  });
});

describe("runEmitterRepl: simulate", () => {
  const plan = (): SimulatedOrder[] => [
    {
      emitter: 0,
      orderId: "order-1",
      items: [{ sku: "A", quantity: 1 }],
      delayMs: 0,
    },
    {
      emitter: 1,
      orderId: "order-2",
      items: [{ sku: "B", quantity: 2 }],
      delayMs: 0,
    },
    { emitter: 2, orderId: "order-3", items: [], delayMs: 0 },
  ];

  it("sends every planned order", async () => {
    const text = await type(await promptEmitters(3), ["simulate 3"], { plan });

    expect(text.match(/→ sent/g)).toHaveLength(3);
  });

  it("sends each planned order from its emitter", async () => {
    const text = await type(await promptEmitters(3), ["simulate 3"], { plan });

    expect(text).toMatch(/\[emitter-3\] → sent .*\(order-3\)/);
  });

  it("waits for every simulated answer before finishing", async () => {
    const text = await type(await promptEmitters(3), ["simulate 3"], { plan });

    expect(text.match(/← cmd/g)).toHaveLength(3);
  });

  it("finishes a simulation when quit is typed right behind it", async () => {
    const text = await type(await promptEmitters(3), ["simulate 3", "quit"], {
      plan,
    });

    expect(text.match(/← cmd/g)).toHaveLength(3);
  });

  it("asks the plan for the count typed", async () => {
    const planSpy = vi.fn(plan);

    await type(await promptEmitters(3), ["simulate 3"], { plan: planSpy });

    expect(planSpy).toHaveBeenCalledWith(3, 3);
  });
});

describe("runEmitterRepl: the prompt", () => {
  it("explains an invalid line", async () => {
    const send = vi.fn();

    const text = await type(
      [{ label: "[e]", emitter: { send }, paint: (t) => t }],
      ["place"],
    );

    expect(text).toContain(
      "place needs an order id: place <orderId> [sku:qty ...]",
    );
  });

  it("does not send an invalid line", async () => {
    const send = vi.fn();

    await type(
      [{ label: "[e]", emitter: { send }, paint: (t) => t }],
      ["place order-1 nonsense"],
    );

    expect(send).not.toHaveBeenCalled();
  });

  it("waits for the answers still due when told to quit", async () => {
    const text = await type(await promptEmitters(1), [
      "place order-1 BOOK-1:1",
      "quit",
    ]);

    expect(text).toMatch(/accepted in \d+ms/);
  });

  it("stops reading at quit", async () => {
    const text = await type(await promptEmitters(1), [
      "quit",
      "place order-1 BOOK-1:1",
    ]);

    expect(text).not.toContain("→ sent");
  });
});
