import { afterAll, beforeEach, afterEach, expect } from "vitest";

import { PostgresRepository } from "../postgresRepository";
import {
  User,
  closePool,
  describePg,
  dropRepo,
  itPg,
  makeEvent,
  makeFreshRepo,
  makeUser,
} from "./helpers";
import {
  ConcurrentWriteError,
  DomainEventInterface,
} from "@ontologic/ontologic";

describePg("PostgresRepository.saveWithEvents", () => {
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
    const result = await repo.saveWithEvents(makeUser("1"), [makeEvent("1")]);
    expect(result.isOk()).toBe(true);
  });

  itPg("persists the entity", async () => {
    const user = makeUser("1");
    await repo.saveWithEvents(user, [makeEvent("1")]);

    const result = await repo.getById("1");
    expect(result._unsafeUnwrap()?.readState()).toEqual(user.readState());
  });

  itPg("stores the provided events", async () => {
    const event = makeEvent("1", "UserCreated");
    await repo.saveWithEvents(makeUser("1"), [event]);

    const events = (await repo.getEvents("1"))._unsafeUnwrap();
    expect(events).toHaveLength(1);
    expect(events[0]?.event).toEqual(event);
    expect(events[0]?.metadata.offset).toBe(0);
  });

  itPg("accumulates events across multiple calls for the same entity", async () => {
    const user = makeUser("1");
    const event1 = makeEvent("1", "Created");
    const event2 = makeEvent("1", "Updated");

    await repo.saveWithEvents(user, [event1]);
    await repo.saveWithEvents(user, [event2]);

    const events = (await repo.getEvents("1"))._unsafeUnwrap();
    expect(events.map((e) => e.event)).toEqual([event1, event2]);
    expect(events[0]?.metadata.offset).toBe(0);
    expect(events[1]?.metadata.offset).toBe(1);
  });

  itPg("does not mix events between different entities", async () => {
    await repo.saveWithEvents(makeUser("1"), [makeEvent("1", "Created")]);
    await repo.saveWithEvents(makeUser("2"), [makeEvent("2", "Created")]);

    const events1 = (await repo.getEvents("1"))._unsafeUnwrap();
    const events2 = (await repo.getEvents("2"))._unsafeUnwrap();
    expect(events1).toHaveLength(1);
    expect(events2).toHaveLength(1);
    expect(events1[0]?.event.entityId).toBe("1");
    expect(events2[0]?.event.entityId).toBe("2");
  });

  itPg("keeps the entity version unchanged after the first saveWithEvents (INSERT)", async () => {
    const user = makeUser("1", "Alice", 1);
    await repo.saveWithEvents(user, [makeEvent("1")]);

    // INSERT path: the supplied version is what gets stored, no bump.
    expect(user.version()).toBe(1);
  });

  itPg("bumps the entity version on subsequent saveWithEvents calls (UPDATE)", async () => {
    const user = makeUser("1", "Alice", 1);

    await repo.saveWithEvents(user, [makeEvent("1", "Created")]);
    expect(user.version()).toBe(1);

    await repo.saveWithEvents(user, [makeEvent("1", "Updated")]);
    expect(user.version()).toBe(2);

    await repo.saveWithEvents(user, [makeEvent("1", "Tagged")]);
    expect(user.version()).toBe(3);
  });

  itPg(
    "returns err with a ConcurrentWriteError when saveWithEvents is called with a stale entity",
    async () => {
      const fresh = makeUser("1", "Alice", 1);
      await repo.saveWithEvents(fresh, [makeEvent("1", "Created")]);
      await repo.saveWithEvents(fresh, [makeEvent("1", "Updated")]); // v=2

      const stale = makeUser("1", "Bob", 1);
      const result = await repo.saveWithEvents(stale, [makeEvent("1", "Lost")]);

      expect(result.isErr()).toBe(true);
      const error = result._unsafeUnwrapErr();
      expect(error).toBeInstanceOf(ConcurrentWriteError);
      expect((error as ConcurrentWriteError).entityId).toBe("1");
      expect((error as ConcurrentWriteError).expectedVersion).toBe(1);
      expect(error.name).toBe("CONCURRENT_WRITE");
    },
  );

  itPg(
    "does not bump the entity version or append events when saveWithEvents fails",
    async () => {
      const fresh = makeUser("1", "Alice", 1);
      await repo.saveWithEvents(fresh, [makeEvent("1", "Created")]);
      await repo.saveWithEvents(fresh, [makeEvent("1", "Updated")]); // v=2

      const stale = makeUser("1", "Bob", 1);
      const result = await repo.saveWithEvents(stale, [makeEvent("1", "Lost")]);

      expect(result.isErr()).toBe(true);
      // Stale entity's version is untouched.
      expect(stale.version()).toBe(1);
      // The failed call's event must not have been appended (rolled back).
      const events = (await repo.getEvents("1"))._unsafeUnwrap();
      expect(events.map((e) => e.event.name)).toEqual(["Created", "Updated"]);
    },
  );

  itPg("creates a fresh entity (version=0) at v=1 in the store", async () => {
    const fresh = makeUser("1", "Alice", 0);
    const result = await repo.saveWithEvents(fresh, [
      makeEvent("1", "Created"),
    ]);

    expect(result.isOk()).toBe(true);
    expect(fresh.version()).toBe(1);
  });

  itPg(
    "returns ConcurrentWriteError when two writers try to create the same id with events",
    async () => {
      const first = makeUser("1", "Alice", 0);
      const second = makeUser("1", "Bob", 0);

      const okResult = await repo.saveWithEvents(first, [
        makeEvent("1", "Created"),
      ]);
      expect(okResult.isOk()).toBe(true);

      const conflictResult = await repo.saveWithEvents(second, [
        makeEvent("1", "DuplicateCreate"),
      ]);
      expect(conflictResult.isErr()).toBe(true);
      expect(conflictResult._unsafeUnwrapErr()).toBeInstanceOf(
        ConcurrentWriteError,
      );

      // The losing writer's event must not have been appended (transaction
      // rolled back together with the upsert).
      const events = (await repo.getEvents("1"))._unsafeUnwrap();
      expect(events.map((e) => e.event.name)).toEqual(["Created"]);

      // First writer's state is preserved.
      const stored = (await repo.getById("1"))._unsafeUnwrap();
      expect(stored?.readState().name).toBe("Alice");
    },
  );

  itPg(
    "serializes concurrent saveWithEvents calls for the same in-memory entity",
    async () => {
      const user = makeUser("concurrent", "Alice", 1);

      const results = await Promise.all(
        Array.from({ length: 10 }).map((_, i) =>
          repo.saveWithEvents(user, [makeEvent("concurrent", `Event-${i}`)]),
        ),
      );

      const succeeded = results.filter((r) => r.isOk());
      const failed = results.filter((r) => r.isErr());

      // All 10 calls capture previousVersion=1 synchronously before any await,
      // so under optimistic concurrency only the INSERT and the very first
      // UPDATE-at-v=1 commit; the remaining calls trip the version check.
      expect(succeeded.length).toBeGreaterThan(0);
      expect(succeeded.length).toBeLessThan(10);
      expect(failed.length).toBe(10 - succeeded.length);

      // Every failure is a ConcurrentWriteError (not some other infra error).
      for (const r of failed) {
        expect(r._unsafeUnwrapErr()).toBeInstanceOf(ConcurrentWriteError);
      }

      // Whichever events did commit must form a contiguous offset run.
      const events = (await repo.getEvents("concurrent"))._unsafeUnwrap();
      expect(events).toHaveLength(succeeded.length);
      expect(events.map((e) => e.metadata.offset)).toEqual(
        Array.from({ length: succeeded.length }, (_, i) => i),
      );
    },
  );
});
