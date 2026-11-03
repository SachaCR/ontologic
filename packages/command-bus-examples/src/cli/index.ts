import { createConnectors, type ConnectorSet } from "../connectors";
import { loadLocalEnv } from "../env";
import {
  startEmitter,
  startReceiver,
  type PlaceOrderEmitter,
  type PlaceOrderReceiver,
} from "../commandBus";
import { colorsEnabled, emitterPaint, receiverPaint } from "./colors";
import { parseCliArgs, USAGE, UsageError, type CliConfig } from "./config";
import { runEmitterRepl, type PromptEmitter } from "./emitterRepl";
import {
  answeredLine,
  emitterLabel,
  receivedLine,
  receiverLabel,
} from "./format";
import { randomLatency } from "./simulation";

/**
 * The command bus CLI: several emitters and several receivers per process.
 *
 *   pnpm cli receiver   # terminal 1: 3 receivers
 *   pnpm cli emitter    # terminal 2: 3 emitters behind one prompt, try `simulate`
 *
 * See USAGE in ./config for every option.
 */
async function main(): Promise<number> {
  loadLocalEnv();

  let config: CliConfig;

  try {
    const parsed = parseCliArgs(process.argv.slice(2), process.env);

    if ("help" in parsed) {
      console.log(USAGE);
      return 0;
    }

    config = parsed;
  } catch (error: unknown) {
    if (error instanceof UsageError) {
      console.error(`${error.message}\n\n${USAGE}`);
      return 2;
    }

    throw error;
  }

  const colors = colorsEnabled(process.stdout, process.env);
  const log = (line: string) => console.log(line);
  const range = `${config.latency.minMs}-${config.latency.maxMs}ms`;

  const connectorSets: ConnectorSet[] = [];
  const receivers: PlaceOrderReceiver[] = [];
  const emitters: PlaceOrderEmitter[] = [];
  const promptEmitters: PromptEmitter[] = [];

  /** A connector set of its own for each instance, released on shutdown. */
  function connectorsFor(instance: string) {
    const set = createConnectors(config.transport, config, instance);
    connectorSets.push(set);

    return set.connectors;
  }

  async function shutdown(): Promise<void> {
    // The emitters first: they drain their in-flight commands, which needs the
    // receivers still answering.
    await Promise.allSettled(emitters.map((emitter) => emitter.stop()));
    await Promise.allSettled(receivers.map((receiver) => receiver.stop()));
    await Promise.allSettled(connectorSets.map((set) => set.disconnect()));
  }

  try {
    if (config.role !== "emitter") {
      for (let index = 0; index < config.instances; index += 1) {
        const label = receiverLabel(index);
        const paint = receiverPaint(index, colors);

        receivers.push(
          await startReceiver(connectorsFor(`receiver-${index + 1}`), {
            latencyMs: () =>
              randomLatency(config.latency.minMs, config.latency.maxMs),
            onReceived: (command, metadata) =>
              log(paint(receivedLine(label, command, metadata))),
            onAnswered: (_command, metadata, answer, latencyMs) =>
              log(paint(answeredLine(label, metadata, answer, latencyMs))),
            onError: (error) =>
              log(paint(`${label} error: ${describe(error)}`)),
          }),
        );

        log(
          paint(
            `${label} listening on ${config.transport} (${config.commandTopic}), answering in ${range}`,
          ),
        );
      }
    }

    if (config.role !== "receiver") {
      for (let index = 0; index < config.instances; index += 1) {
        const label = emitterLabel(index);
        const paint = emitterPaint(index, colors);

        const emitter = await startEmitter(
          connectorsFor(`emitter-${index + 1}`),
          {
            timeout: config.timeout,
            onError: (error) =>
              log(paint(`${label} error: ${describe(error)}`)),
          },
        );

        emitters.push(emitter);
        promptEmitters.push({ label, emitter, paint });

        log(
          paint(
            `${label} sending on ${config.transport} (${config.commandTopic}), timeout ${config.timeout}ms`,
          ),
        );
      }

      await runEmitterRepl({
        emitters: promptEmitters,
        input: process.stdin,
        output: process.stdout,
      });
    } else {
      await untilSignal();
    }

    log("Stopping...");
    await shutdown();

    return 0;
  } catch (error: unknown) {
    console.error(`Failed: ${describe(error)}`);
    await shutdown().catch(() => {});

    return 1;
  }
}

/** Resolves on Ctrl+C or a termination signal. */
function untilSignal(): Promise<void> {
  return new Promise((resolve) => {
    process.once("SIGINT", () => resolve());
    process.once("SIGTERM", () => resolve());
  });
}

/** An error and the chain of causes under it, on one line. */
function describe(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;

  while (current !== undefined && parts.length < 5) {
    parts.push(current instanceof Error ? current.message : String(current));
    current = current instanceof Error ? current.cause : undefined;
  }

  return parts.join(" <- ");
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(error);
    process.exit(1);
  },
);
