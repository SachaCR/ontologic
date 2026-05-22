import { afterAll, beforeEach, afterEach, expect } from "vitest";

import { PostgresRepository } from "../postgresRepository";
import {
  User,
  closePool,
  describePg,
  dropRepo,
  itPg,
  makeFreshRepo,
  makeUser,
} from "./helpers";
import {
  ConcurrentWriteError,
  DomainEventInterface,
} from "@ontologic/ontologic";

describePg("PostgresRepository.save", () => {
  let repo: PostgresRepository<User, DomainEventInterface>;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    const fresh = await makeFreshRepo();
    repo = fresh.repo;
    cleanup = () => dropRepo(fresh.pool, fresh.table, fresh.eventsTable);
  });

  afterEach(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await closePool();
  });

  itPg("returns ok", async () => {
    const result = await repo.save(makeUser("1"));
    expect(result.isOk()).toBe(true);
  });

  itPg("persists the entity so it can be retrieved", async () => {
    const user = makeUser("1", "Alice");
    await repo.save(user);

    const result = await repo.getById("1");
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()?.readState()).toEqual(user.readState());
  });

  itPg("overwrites an existing entity with the same id", async () => {
    await repo.save(makeUser("1", "Alice"));
    await repo.save(makeUser("1", "Bob"));

    const result = await repo.getById("1");
    expect(result._unsafeUnwrap()?.readState().name).toBe("Bob");
  });

  itPg("keeps the entity version unchanged after the first save (INSERT)", async () => {
    const user = makeUser("1", "Alice", 1);
    await repo.save(user);

    // INSERT path: the supplied version is what gets stored, no bump.
    expect(user.version()).toBe(1);
  });

  itPg("bumps the entity version on subsequent saves (UPDATE)", async () => {
    const user = makeUser("1", "Alice", 1);

    await repo.save(user);
    expect(user.version()).toBe(1);

    await repo.save(user);
    expect(user.version()).toBe(2);

    await repo.save(user);
    expect(user.version()).toBe(3);
  });

  itPg(
    "returns err with a ConcurrentWriteError when saving a stale entity",
    async () => {
      const fresh = makeUser("1", "Alice", 1);
      await repo.save(fresh); // INSERT, row at v=1
      await repo.save(fresh); // UPDATE, row at v=2, fresh.version() is now 2

      // A separately constructed instance that still thinks the row is at v=1.
      const stale = makeUser("1", "Bob", 1);
      const result = await repo.save(stale);

      expect(result.isErr()).toBe(true);
      const error = result._unsafeUnwrapErr();
      expect(error).toBeInstanceOf(ConcurrentWriteError);
      expect((error as ConcurrentWriteError).entityId).toBe("1");
      expect((error as ConcurrentWriteError).expectedVersion).toBe(1);
      expect(error.name).toBe("CONCURRENT_WRITE");
    },
  );

  itPg("does not bump the entity version when the save fails", async () => {
    const fresh = makeUser("1", "Alice", 1);
    await repo.save(fresh);
    await repo.save(fresh); // v=2

    const stale = makeUser("1", "Bob", 1);
    await repo.save(stale);

    // The failed save must not mutate the stale entity's version.
    expect(stale.version()).toBe(1);
  });

  itPg("creates a fresh entity (version=0) at v=1 in the store", async () => {
    const fresh = makeUser("1", "Alice", 0);
    const result = await repo.save(fresh);

    expect(result.isOk()).toBe(true);
    // Creation path lands the row at v=1 so subsequent saves go through
    // the UPDATE path.
    expect(fresh.version()).toBe(1);
  });

  itPg(
    "returns ConcurrentWriteError when two writers try to create the same id",
    async () => {
      const first = makeUser("1", "Alice", 0);
      const second = makeUser("1", "Bob", 0);

      const okResult = await repo.save(first);
      expect(okResult.isOk()).toBe(true);

      // Second writer thinks the entity is brand-new — must not silently
      // overwrite the first writer's row.
      const conflictResult = await repo.save(second);
      expect(conflictResult.isErr()).toBe(true);
      const error = conflictResult._unsafeUnwrapErr();
      expect(error).toBeInstanceOf(ConcurrentWriteError);
      expect((error as ConcurrentWriteError).entityId).toBe("1");
      expect((error as ConcurrentWriteError).expectedVersion).toBe(0);

      // First writer's state is preserved.
      const stored = (await repo.getById("1"))._unsafeUnwrap();
      expect(stored?.readState().name).toBe("Alice");
    },
  );

  itPg(
    "transitions a fresh entity from creation to update on the second save",
    async () => {
      const user = makeUser("1", "Alice", 0);

      await repo.save(user); // INSERT path, v becomes 1
      expect(user.version()).toBe(1);

      await repo.save(user); // UPDATE path now (v=1)
      expect(user.version()).toBe(2);
    },
  );
});
