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
import { DomainEventInterface } from "@ontologic/ontologic";

describePg("PostgresRepository.getById", () => {
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

  itPg("returns ok with undefined when entity does not exist", async () => {
    const result = await repo.getById("missing");
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toBe(undefined);
  });

  itPg("returns ok with the entity when it exists", async () => {
    const user = makeUser("42", "Charlie");
    await repo.save(user);

    const result = await repo.getById("42");
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()?.readState()).toEqual({
      id: "42",
      name: "Charlie",
    });
  });

  itPg("rehydrates the entity with its persisted version", async () => {
    const user = makeUser("42", "Charlie", 1);
    await repo.save(user); // INSERT, v=1
    await repo.save(user); // UPDATE, v=2
    await repo.save(user); // UPDATE, v=3

    const result = await repo.getById("42");
    expect(result._unsafeUnwrap()?.version()).toBe(3);
  });
});
