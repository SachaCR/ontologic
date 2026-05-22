import { afterAll, beforeEach, afterEach, describe, expect } from "vitest";

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
  DomainEventInterface,
  EventWithMetadata,
} from "@ontologic/ontologic";

describePg("PostgresRepository.getEvents", () => {
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

  itPg("returns ok with an empty array when no events have been saved", async () => {
    const result = await repo.getEvents("unknown");
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual([]);
  });

  itPg(
    "assigns sequential offsets with no gaps across multiple saveWithEvents calls",
    async () => {
      const user = makeUser("1");
      await repo.saveWithEvents(user, [makeEvent("1", "Created")]);
      await repo.saveWithEvents(user, [
        makeEvent("1", "Updated"),
        makeEvent("1", "Tagged"),
      ]);
      await repo.saveWithEvents(user, [makeEvent("1", "Deleted")]);

      const events = (await repo.getEvents("1"))._unsafeUnwrap();
      expect(events.map((e) => e.metadata.offset)).toEqual([0, 1, 2, 3]);
    },
  );

  itPg("returns all events saved for an entity in order", async () => {
    const user = makeUser("1");
    const event1 = makeEvent("1", "Created");
    const event2 = makeEvent("1", "Updated");
    const event3 = makeEvent("1", "Deleted");

    await repo.saveWithEvents(user, [event1, event2]);
    await repo.saveWithEvents(user, [event3]);

    const events = (await repo.getEvents("1"))._unsafeUnwrap();
    expect(events.map((e) => e.event)).toEqual([event1, event2, event3]);
    expect(events.map((e) => e.metadata.offset)).toEqual([0, 1, 2]);
  });

  describe("pagination", () => {
    itPg("respects limit", async () => {
      await repo.saveWithEvents(makeUser("1"), [
        makeEvent("1", "Created"),
        makeEvent("1", "Updated"),
        makeEvent("1", "Deleted"),
      ]);
      const all = (await repo.getEvents("1"))._unsafeUnwrap();

      const events = (
        await repo.getEvents("1", { limit: 2, offset: 0 })
      )._unsafeUnwrap();
      expect(events).toEqual([all[0], all[1]]);
    });

    itPg("respects offset", async () => {
      await repo.saveWithEvents(makeUser("1"), [
        makeEvent("1", "Created"),
        makeEvent("1", "Updated"),
        makeEvent("1", "Deleted"),
      ]);
      const all = (await repo.getEvents("1"))._unsafeUnwrap();

      const events = (
        await repo.getEvents("1", { limit: 10, offset: 1 })
      )._unsafeUnwrap();
      expect(events).toEqual([all[1], all[2]]);
    });

    itPg("returns empty array when offset exceeds event count", async () => {
      await repo.saveWithEvents(makeUser("1"), [makeEvent("1", "Created")]);
      const events = (
        await repo.getEvents("1", { limit: 10, offset: 99 })
      )._unsafeUnwrap();
      expect(events).toEqual([]);
    });

    itPg("defaults to limit 100 and offset 0 when no options provided", async () => {
      await repo.saveWithEvents(makeUser("1"), [
        makeEvent("1", "Created"),
        makeEvent("1", "Updated"),
        makeEvent("1", "Deleted"),
      ]);
      const events: EventWithMetadata<DomainEventInterface>[] = (
        await repo.getEvents("1")
      )._unsafeUnwrap();
      expect(events).toHaveLength(3);
    });
  });
});
