import { describe, it, expect, beforeEach, vi } from "vitest";

import { InMemoryRepository } from "../../inMemoryRepository";
import { User, makeUser, makeEvent } from "./helpers";
import { ConcurrentWriteError } from "../../concurrentWriteError";
import { DomainEventInterface } from "../../domainEvent";

describe("InMemoryRepository.saveWithEvents", () => {
  let repo: InMemoryRepository<User, DomainEventInterface>;

  beforeEach(() => {
    repo = new InMemoryRepository<User, DomainEventInterface>(User.fromState);
  });

  it("returns ok", async () => {
    const result = await repo.saveWithEvents(makeUser("1"), [makeEvent("1")]);
    expect(result.isOk()).toBe(true);
  });

  it("persists the entity", async () => {
    const user = makeUser("1");
    await repo.saveWithEvents(user, [makeEvent("1")]);

    const result = await repo.getById("1");
    expect(result._unsafeUnwrap()?.readState()).toEqual(user.readState());
  });

  it("stores the provided events", async () => {
    const event = makeEvent("1", "UserCreated");
    await repo.saveWithEvents(makeUser("1"), [event]);

    const events = (await repo.getEvents("1"))._unsafeUnwrap();
    expect(events).toHaveLength(1);
    expect(events[0]?.event).toEqual(event);
    expect(events[0]?.metadata.offset).toBe(0);
  });

  it("accumulates events across multiple calls for the same entity", async () => {
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

  it("does not mix events between different entities", async () => {
    await repo.saveWithEvents(makeUser("1"), [makeEvent("1", "Created")]);
    await repo.saveWithEvents(makeUser("2"), [makeEvent("2", "Created")]);

    const events1 = (await repo.getEvents("1"))._unsafeUnwrap();
    const events2 = (await repo.getEvents("2"))._unsafeUnwrap();
    expect(events1).toHaveLength(1);
    expect(events2).toHaveLength(1);
    expect(events1[0]?.event.entityId).toBe("1");
    expect(events2[0]?.event.entityId).toBe("2");
  });

  it("keeps the entity version unchanged after the first saveWithEvents (INSERT)", async () => {
    const user = makeUser("1", "Alice", 1);
    await repo.saveWithEvents(user, [makeEvent("1")]);
    expect(user.version()).toBe(1);
  });

  it("bumps the entity version on subsequent saveWithEvents calls (UPDATE)", async () => {
    const user = makeUser("1", "Alice", 1);

    await repo.saveWithEvents(user, [makeEvent("1", "Created")]);
    expect(user.version()).toBe(1);

    await repo.saveWithEvents(user, [makeEvent("1", "Updated")]);
    expect(user.version()).toBe(2);
  });

  it("returns err with a ConcurrentWriteError when called with a stale entity", async () => {
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
  });

  it("does not append events or fire onChanges when saveWithEvents fails", async () => {
    const fresh = makeUser("1", "Alice", 1);
    await repo.saveWithEvents(fresh, [makeEvent("1", "Created")]);
    await repo.saveWithEvents(fresh, [makeEvent("1", "Updated")]); // v=2

    const stale = makeUser("1", "Bob", 1);
    const handler = vi.fn();
    repo.onChanges(handler);

    await repo.saveWithEvents(stale, [makeEvent("1", "Lost")]);

    // Stale entity untouched.
    expect(stale.version()).toBe(1);
    // The rejected call's event must not have been appended.
    const events = (await repo.getEvents("1"))._unsafeUnwrap();
    expect(events.map((e) => e.event.name)).toEqual(["Created", "Updated"]);
    // No notification fired for the failed save.
    expect(handler).not.toHaveBeenCalled();
  });

  it("creates a fresh entity (version=0) at v=1 in the store", async () => {
    const fresh = makeUser("1", "Alice", 0);
    const result = await repo.saveWithEvents(fresh, [makeEvent("1", "Created")]);

    expect(result.isOk()).toBe(true);
    expect(fresh.version()).toBe(1);
  });

  it("returns ConcurrentWriteError when two writers try to create the same id with events", async () => {
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

    // The losing writer's event must not have been appended.
    const events = (await repo.getEvents("1"))._unsafeUnwrap();
    expect(events.map((e) => e.event.name)).toEqual(["Created"]);

    // First writer's state is preserved.
    const stored = (await repo.getById("1"))._unsafeUnwrap();
    expect(stored?.readState().name).toBe("Alice");
  });
});
