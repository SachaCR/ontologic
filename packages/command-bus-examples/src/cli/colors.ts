/** Paints a whole log line. Identity when colors are off. */
export type Paint = (text: string) => string;

/** ANSI foreground codes, one per instance, cycled past the end. */
const EMITTER_COLORS = [36, 35, 33] as const; // cyan, magenta, yellow
const RECEIVER_COLORS = [32, 34, 37] as const; // green, blue, white

/**
 * Colors on a terminal, off in a pipe or a file, and as the user asks
 * otherwise: `NO_COLOR` turns them off, `FORCE_COLOR` turns them on
 * (https://no-color.org).
 */
export function colorsEnabled(
  output: { isTTY?: boolean },
  env: Readonly<Record<string, string | undefined>>,
): boolean {
  if (env["NO_COLOR"] !== undefined && env["NO_COLOR"] !== "") {
    return false;
  }

  if (env["FORCE_COLOR"] !== undefined && env["FORCE_COLOR"] !== "0") {
    return true;
  }

  return output.isTTY === true;
}

function painter(code: number, enabled: boolean): Paint {
  return enabled ? (text) => `\u001b[${code}m${text}\u001b[0m` : (text) => text;
}

export function emitterPaint(index: number, enabled: boolean): Paint {
  return painter(EMITTER_COLORS[index % EMITTER_COLORS.length] ?? 36, enabled);
}

export function receiverPaint(index: number, enabled: boolean): Paint {
  return painter(
    RECEIVER_COLORS[index % RECEIVER_COLORS.length] ?? 32,
    enabled,
  );
}
