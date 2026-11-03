/**
 * How long a graceful `stop()` waits for in-flight work before it forces the
 * shutdown: 2 minutes.
 */
export const DEFAULT_STOP_TIMEOUT_MS = 120_000;

/**
 * Waits for `work` to settle, but no longer than `ms`.
 *
 * Resolves `true` when the work settled in time, `false` when the limit hit
 * first. It never rejects: a failure inside `work` is the caller's to report,
 * this only decides whether the drain is over. The timer is always cleared, so
 * a drain that finished early does not hold the event loop open.
 */
export async function settlesWithin(
  work: Promise<unknown>,
  ms: number,
): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const limit = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), ms);
  });

  try {
    return await Promise.race([
      work.then(
        () => true,
        () => true,
      ),
      limit,
    ]);
  } finally {
    clearTimeout(timer);
  }
}
