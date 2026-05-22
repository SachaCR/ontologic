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
import { DomainEventInterface } from "@ontologic/ontologic";

describePg("PostgresRepository.getEventsAfter", () => {
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

  itPg("returns events starting at offset 0 when eventId is undefined", async () => {
    await repo.saveWithEvents(makeUser("1"), [
      makeEvent("1", "Created"),
      makeEvent("1", "Updated"),
    ]);

    const all = (await repo.getEvents("1"))._unsafeUnwrap();
    const result = (
      await repo.getEventsAfter("1", undefined)
    )._unsafeUnwrap();
    expect(result).toEqual(all);
  });

  itPg("returns events starting at the matched event when eventId is known", async () => {
    await repo.saveWithEvents(makeUser("1"), [
      makeEvent("1", "Created"),
      makeEvent("1", "Updated"),
      makeEvent("1", "Deleted"),
    ]);
    const all = (await repo.getEvents("1"))._unsafeUnwrap();
    const middleId = all[1]?.metadata.id;
    expect(middleId).toBeDefined();

    const result = (
      await repo.getEventsAfter("1", middleId)
    )._unsafeUnwrap();
    // Matches InMemoryRepository: starts AT the matched event, not after it.
    expect(result.map((e) => e.metadata.offset)).toEqual([1, 2]);
  });

  itPg("falls back to offset 0 when eventId is unknown", async () => {
    await repo.saveWithEvents(makeUser("1"), [
      makeEvent("1", "Created"),
      makeEvent("1", "Updated"),
    ]);
    const all = (await repo.getEvents("1"))._unsafeUnwrap();
    const result = (
      await repo.getEventsAfter("1", "00000000-0000-0000-0000-000000000000")
    )._unsafeUnwrap();
    expect(result).toEqual(all);
  });

  itPg("respects the limit argument", async () => {
    await repo.saveWithEvents(makeUser("1"), [
      makeEvent("1", "Created"),
      makeEvent("1", "Updated"),
      makeEvent("1", "Deleted"),
    ]);
    const result = (
      await repo.getEventsAfter("1", undefined, 2)
    )._unsafeUnwrap();
    expect(result).toHaveLength(2);
  });
});
