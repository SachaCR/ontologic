/**
 * Returned by a `Repository.save` / `Repository.saveWithEvents` call when the
 * persisted row's version no longer matches the version the in-memory entity
 * was loaded at — i.e. another writer committed first.
 *
 * Unlike `CorruptedStateError`, this is a **recoverable** failure: the caller
 * should reload the entity, re-apply the intended change, and try again. It is
 * intentionally returned inside a `Result` (not thrown) so that retry logic
 * sits in normal control flow.
 */
export class ConcurrentWriteError extends Error {
  declare public name: "CONCURRENT_WRITE";
  public readonly entityId: string;
  public readonly expectedVersion: number;

  constructor(params: { entityId: string; expectedVersion: number }) {
    super(
      `Concurrent write detected on entity "${params.entityId}" ` +
        `(expected version ${params.expectedVersion}). ` +
        `Reload the entity and retry.`,
    );

    this.name = "CONCURRENT_WRITE";
    this.entityId = params.entityId;
    this.expectedVersion = params.expectedVersion;

    Object.setPrototypeOf(this, ConcurrentWriteError.prototype);
  }
}
