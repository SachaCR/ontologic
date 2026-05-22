import { afterAll, beforeEach, afterEach, expect, vi } from "vitest";

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

describePg("PostgresRepository.onChanges", () => {
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

  itPg(
    "calls the handler with the entity id when saveWithEvents is called",
    async () => {
      const handler = vi.fn();
      repo.onChanges(handler);

      await repo.saveWithEvents(makeUser("1"), [makeEvent("1")]);

      expect(handler).toHaveBeenCalledOnce();
      expect(handler).toHaveBeenCalledWith("1");
    },
  );

  itPg("calls the handler once per saveWithEvents call", async () => {
    const handler = vi.fn();
    repo.onChanges(handler);

    await repo.saveWithEvents(makeUser("1"), [makeEvent("1")]);
    await repo.saveWithEvents(makeUser("1"), [makeEvent("1")]);

    expect(handler).toHaveBeenCalledTimes(2);
  });

  itPg("does not call the handler when save is called", async () => {
    const handler = vi.fn();
    repo.onChanges(handler);

    await repo.save(makeUser("1"));

    expect(handler).not.toHaveBeenCalled();
  });

  itPg("supports multiple handlers", async () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();
    repo.onChanges(handler1);
    repo.onChanges(handler2);

    await repo.saveWithEvents(makeUser("1"), [makeEvent("1")]);

    expect(handler1).toHaveBeenCalledWith("1");
    expect(handler2).toHaveBeenCalledWith("1");
  });
});
