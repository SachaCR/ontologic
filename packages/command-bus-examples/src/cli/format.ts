import { type CommandHandlerResponse } from "ontologic";

import {
  type PlaceOrderCommand,
  type PlaceOrderMetadata,
} from "../domain/placeOrder";

/** Command ids are UUIDs; the first block is enough to tell them apart. */
export function shortId(id: string): string {
  return id.slice(0, 8);
}

export function emitterLabel(index: number): string {
  return `[emitter-${index + 1}]`;
}

export function receiverLabel(index: number): string {
  return `[receiver-${index + 1}]`;
}

export function sentLine(label: string, id: string, orderId: string): string {
  return `${label} → sent cmd ${shortId(id)} (${orderId})`;
}

/**
 * How an emitter reports an answer. A business refusal (`COMMAND_REJECTED`) is
 * an answer like any other; every other failure (a timeout, an invalid
 * command, a handler that threw) is reported with its code.
 */
export function answerLine(
  label: string,
  id: string,
  result: CommandHandlerResponse,
  elapsedMs: number,
): string {
  const cmd = `${label} ← cmd ${shortId(id)}`;

  if (result.isOk()) {
    return `${cmd} accepted in ${elapsedMs}ms: ${JSON.stringify(result.value)}`;
  }

  const { name, message } = result.error;
  const code = (result.error.cause as { code?: unknown } | undefined)?.code;

  if (code === "COMMAND_REJECTED") {
    return `${cmd} refused in ${elapsedMs}ms: ${name}: ${message}`;
  }

  return `${cmd} failed after ${elapsedMs}ms: ${String(code ?? name)}: ${message}`;
}

export function notSentLine(label: string, id: string, error: unknown): string {
  return `${label} ✗ cmd ${shortId(id)} not sent: ${error instanceof Error ? error.message : String(error)}`;
}

export function receivedLine(
  label: string,
  command: PlaceOrderCommand,
  metadata: PlaceOrderMetadata,
): string {
  return `${label} received ${command.name} cmd ${shortId(metadata.id)} (${command.payload.orderId}, correlation ${metadata.correlationId})`;
}

export function answeredLine(
  label: string,
  metadata: PlaceOrderMetadata,
  answer: CommandHandlerResponse,
  latencyMs: number,
): string {
  const outcome = answer.isOk() ? "SUCCESS" : `FAILURE ${answer.error.name}`;

  return `${label} answered cmd ${shortId(metadata.id)} after ${latencyMs}ms: ${outcome}`;
}
