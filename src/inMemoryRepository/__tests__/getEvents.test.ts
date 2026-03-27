import { describe, it, expect, beforeEach } from "vitest";

import { InMemoryRepository, DomainEventInterface, EventWithMetadata} from "../../";
import { User, makeUser, makeEvent } from "./helpers";

describe("InMemoryRepository.getEvents", () => {
  let repo: InMemoryRepository<User>;

  beforeEach(() => {
    repo = new InMemoryRepository<User>(User.fromState);
  });

  it("returns ok with an empty array when no events have been saved", async () => {
    const result = await repo.getEvents("unknown");
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual([]);
  });

  it("assigns sequential offsets with no gaps across multiple saveWithEvents calls", async () => {
    const user = makeUser("1");
    await repo.saveWithEvents(user, [makeEvent("1", "Created")]);
    await repo.saveWithEvents(user, [makeEvent("1", "Updated"), makeEvent("1", "Tagged")]);
    await repo.saveWithEvents(user, [makeEvent("1", "Deleted")]);

    const events = (await repo.getEvents("1"))._unsafeUnwrap();
    expect(events.map((e) => e.metadata.offset)).toEqual([0, 1, 2, 3]);
  });

  it("returns all events saved for an entity in order", async () => {
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
    let event1: DomainEventInterface;
    let event2: DomainEventInterface;
    let event3: DomainEventInterface;
    let integrationEvents: EventWithMetadata[];

    beforeEach(async () => {
      event1 = makeEvent("1", "Created");
      event2 = makeEvent("1", "Updated");
      event3 = makeEvent("1", "Deleted");
      await repo.saveWithEvents(makeUser("1"), [event1, event2, event3]);
      integrationEvents = (await repo.getEvents("1"))._unsafeUnwrap();
    });

    it("respects limit", async () => {
      const events = (
        await repo.getEvents("1", { limit: 2, offset: 0 })
      )._unsafeUnwrap();
      expect(events).toEqual([integrationEvents[0], integrationEvents[1]]);
    });

    it("respects offset", async () => {
      const events = (
        await repo.getEvents("1", { limit: 10, offset: 1 })
      )._unsafeUnwrap();
      expect(events).toEqual([integrationEvents[1], integrationEvents[2]]);
    });

    it("respects both limit and offset", async () => {
      const events = (
        await repo.getEvents("1", { limit: 1, offset: 1 })
      )._unsafeUnwrap();
      expect(events).toEqual([integrationEvents[1]]);
    });

    it("returns empty array when offset exceeds event count", async () => {
      const events = (
        await repo.getEvents("1", { limit: 10, offset: 99 })
      )._unsafeUnwrap();
      expect(events).toEqual([]);
    });

    it("defaults to limit 100 and offset 0 when no options provided", async () => {
      const events = (await repo.getEvents("1"))._unsafeUnwrap();
      expect(events).toEqual(integrationEvents);
    });
  });
});
