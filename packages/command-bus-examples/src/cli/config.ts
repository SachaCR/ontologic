import { parseArgs } from "node:util";

import { TRANSPORTS, type Transport } from "../connectors";

export type Role = "emitter" | "receiver" | "both";

const ROLES: readonly Role[] = ["emitter", "receiver", "both"];

export interface CliConfig {
  role: Role;
  transport: Transport;
  /** How many emitters, and how many receivers, this process runs. */
  instances: number;
  /** How long an emitter waits for an answer, in ms. */
  timeout: number;
  /** A receiver waits a random time in this range before answering, in ms. */
  latency: { minMs: number; maxMs: number };
  redisUrl: string;
  /** The Redis stream, or the SQS FIFO queue (`.fifo` included). */
  commandTopic: string;
  region: string;
  sqsEndpoint?: string;
}

export const USAGE = `Usage: pnpm cli [emitter|receiver|both] [options]

Roles (default: both):
  emitter    interactive prompt in front of the emitters: send commands, simulate
             traffic, see the answers come back
  receiver   handles commands and logs each one it answers
  both       emitters and receivers in the same process

Options:
  --transport <redis|sqs>   default: sqs
                            redis = commands and responses on Redis
                            sqs   = commands on SQS FIFO, responses on Redis
  --instances <n>           emitters, and receivers, this process runs (default 3)
  --timeout <ms>            how long an emitter waits for an answer (default 10000)
  --latency <min-max>       a receiver waits a random time in this range before
                            answering, in ms (default 500-3000)
  -h, --help                show this help

Environment (or .env):
  REDIS_URL      default redis://127.0.0.1:6379
  SQS_ENDPOINT   e.g. http://localhost:4566 for LocalStack; unset for real AWS
  AWS_REGION     default us-east-1
  COMMAND_TOPIC  default place-order-commands (".fifo" is added for sqs)
  NO_COLOR       set to turn colors off`;

/** A command line that makes no sense. The message says why. */
export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsageError";
  }
}

export function parseCliArgs(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
): CliConfig | { help: true } {
  let parsed: ReturnType<typeof parseCommandLineOptions>;

  try {
    parsed = parseCommandLineOptions(argv);
  } catch (error: unknown) {
    throw new UsageError(
      error instanceof Error ? error.message : String(error),
    );
  }

  const { values, positionals } = parsed;

  if (values.help === true) {
    return { help: true };
  }

  if (positionals.length > 1) {
    throw new UsageError(`Expected one role, got: ${positionals.join(" ")}`);
  }

  const role = oneOf("role", positionals[0] ?? "both", ROLES);
  const transport = oneOf("transport", values.transport ?? "sqs", TRANSPORTS);

  const baseTopic = env["COMMAND_TOPIC"] ?? "place-order-commands";
  const sqsEndpoint = env["SQS_ENDPOINT"];

  return {
    role,
    transport,
    instances: wholeNumber("--instances", values.instances ?? "3", 1),
    timeout: wholeNumber("--timeout", values.timeout ?? "10000", 1),
    latency: latencyRange(values.latency ?? "500-3000"),
    redisUrl: env["REDIS_URL"] ?? "redis://127.0.0.1:6379",
    commandTopic:
      transport === "sqs" && !baseTopic.endsWith(".fifo")
        ? `${baseTopic}.fifo`
        : baseTopic,
    region: env["AWS_REGION"] ?? "us-east-1",
    ...(sqsEndpoint === undefined || sqsEndpoint === "" ? {} : { sqsEndpoint }),
  };
}

function parseCommandLineOptions(argv: readonly string[]) {
  return parseArgs({
    // `pnpm cli -- receiver` forwards the "--", which would otherwise end the
    // options and turn every flag after it into a positional.
    args: argv.filter((arg) => arg !== "--"),
    allowPositionals: true,
    strict: true,
    options: {
      transport: { type: "string" },
      instances: { type: "string" },
      timeout: { type: "string" },
      latency: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });
}

function oneOf<T extends string>(
  what: string,
  value: string,
  allowed: readonly T[],
): T {
  if (!(allowed as readonly string[]).includes(value)) {
    throw new UsageError(
      `Unknown ${what} "${value}", expected one of: ${allowed.join(", ")}`,
    );
  }

  return value as T;
}

function wholeNumber(flag: string, value: string, min: number): number {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < min) {
    throw new UsageError(
      `${flag} must be a whole number of at least ${min}, got "${value}"`,
    );
  }

  return parsed;
}

function latencyRange(value: string): { minMs: number; maxMs: number } {
  const match = /^(\d+)-(\d+)$/.exec(value);
  const minMs = Number(match?.[1]);
  const maxMs = Number(match?.[2]);

  if (match === null || minMs > maxMs) {
    throw new UsageError(
      `--latency must be a range of ms like 500-3000, got "${value}"`,
    );
  }

  return { minMs, maxMs };
}
