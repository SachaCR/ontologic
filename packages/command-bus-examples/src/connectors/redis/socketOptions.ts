/**
 * The socket configuration every Redis connector in this package shares.
 *
 * It lived inline in all four connectors, which is how the retry multiplier
 * came to differ between them. One copy means the next change is one edit.
 *
 * @param connectorName the connector's `name`, so a give-up error says which
 *   connector could not reach Redis.
 */
export function redisSocketOptions(connectorName: string) {
  return {
    connectTimeout: 2000,

    /**
     * Retries with real exponential backoff — 500ms, 1s, 2s, 4s, 8s — then gives
     * up after the fifth, ~15.5s in.
     *
     * The ceiling matters: node-redis retries forever by default, so `connect()`
     * never rejects and a bus started against a down Redis hangs at boot with no
     * error. Returning an `Error` is the documented way to stop, and it becomes
     * the `cause` of the connector's own "Failed to start".
     *
     * The 10s cap has to stay well above `2 ** 4 * 500`, or it truncates the
     * curve into a flat poll — which is what a 1000ms cap did here before.
     *
     * NOTE: this only takes effect once something is listening to the client's
     * `error` event. With no listener node-redis abandons the reconnect loop on
     * the first failure, so `onError()` has to be called before `start()` for
     * the retries to happen at all.
     */
    reconnectStrategy: (retries: number, cause: Error) =>
      retries >= 5
        ? new Error(
            `[${connectorName}] Failed to connect after ${retries} retries, ${cause}`,
          )
        : Math.min(2 ** retries * 500, 10_000),
  };
}
