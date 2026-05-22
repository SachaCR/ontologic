import { describe, it, expect, beforeEach } from "vitest";

import { InMemoryRepository } from "../../inMemoryRepository";
import { User, makeUser } from "./helpers";
import { ConcurrentWriteError } from "../../concurrentWriteError";
import { DomainEventInterface } from "../../domainEvent";

describe("InMemoryRepository.save", () => {
  let repo: InMemoryRepository<User, DomainEventInterface>;

  beforeEach(() => {
    repo = new InMemoryRepository<User, DomainEventInterface>(User.fromState);
  });

  it("returns ok", async () => {
    const result = await repo.save(makeUser("1"));
    expect(result.isOk()).toBe(true);
  });

  it("persists the entity so it can be retrieved", async () => {
    const user = makeUser("1", "Alice");
    await repo.save(user);

    const result = await repo.getById("1");
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()?.readState()).toEqual(user.readState());
  });

  it("overwrites an existing entity with the same id", async () => {
    await repo.save(makeUser("1", "Alice"));
    const updated = makeUser("1", "Bob");
    await repo.save(updated);

    const result = await repo.getById("1");
    expect(result._unsafeUnwrap()?.readState().name).toBe("Bob");
  });

  it("keeps the entity version unchanged after the first save (INSERT)", async () => {
    const user = makeUser("1", "Alice", 1);
    await repo.save(user);
    expect(user.version()).toBe(1);
  });

  it("bumps the entity version on subsequent saves (UPDATE)", async () => {
    const user = makeUser("1", "Alice", 1);

    await repo.save(user);
    expect(user.version()).toBe(1);

    await repo.save(user);
    expect(user.version()).toBe(2);

    await repo.save(user);
    expect(user.version()).toBe(3);
  });

  it("returns err with a ConcurrentWriteError when saving a stale entity", async () => {
    const fresh = makeUser("1", "Alice", 1);
    await repo.save(fresh); // INSERT, v=1
    await repo.save(fresh); // UPDATE, v=2

    // A separately constructed instance still thinking the row is at v=1.
    const stale = makeUser("1", "Bob", 1);
    const result = await repo.save(stale);

    expect(result.isErr()).toBe(true);
    const error = result._unsafeUnwrapErr();
    expect(error).toBeInstanceOf(ConcurrentWriteError);
    expect((error as ConcurrentWriteError).entityId).toBe("1");
    expect((error as ConcurrentWriteError).expectedVersion).toBe(1);
    expect(error.name).toBe("CONCURRENT_WRITE");
  });

  it("does not mutate the store or the entity version when save fails", async () => {
    const fresh = makeUser("1", "Alice", 1);
    await repo.save(fresh);
    await repo.save(fresh); // v=2 in store

    const stale = makeUser("1", "Bob", 1);
    await repo.save(stale);

    // Stale entity's version is untouched.
    expect(stale.version()).toBe(1);
    // Store still holds Alice's state at v=2.
    const stored = (await repo.getById("1"))._unsafeUnwrap();
    expect(stored?.readState().name).toBe("Alice");
    expect(stored?.version()).toBe(2);
  });

  it("creates a fresh entity (version=0) at v=1 in the store", async () => {
    const fresh = makeUser("1", "Alice", 0);
    const result = await repo.save(fresh);

    expect(result.isOk()).toBe(true);
    expect(fresh.version()).toBe(1);
  });

  it("returns ConcurrentWriteError when two writers try to create the same id", async () => {
    const first = makeUser("1", "Alice", 0);
    const second = makeUser("1", "Bob", 0);

    const okResult = await repo.save(first);
    expect(okResult.isOk()).toBe(true);

    const conflictResult = await repo.save(second);
    expect(conflictResult.isErr()).toBe(true);
    const error = conflictResult._unsafeUnwrapErr();
    expect(error).toBeInstanceOf(ConcurrentWriteError);
    expect((error as ConcurrentWriteError).entityId).toBe("1");
    expect((error as ConcurrentWriteError).expectedVersion).toBe(0);

    const stored = (await repo.getById("1"))._unsafeUnwrap();
    expect(stored?.readState().name).toBe("Alice");
  });

  it("transitions a fresh entity from creation to update on the second save", async () => {
    const user = makeUser("1", "Alice", 0);

    await repo.save(user); // INSERT path, v becomes 1
    expect(user.version()).toBe(1);

    await repo.save(user); // UPDATE path now (v=1)
    expect(user.version()).toBe(2);
  });
});
