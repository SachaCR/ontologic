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

describePg("PostgresRepository.list", () => {
  let repo: PostgresRepository<User, DomainEventInterface>;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    const fresh = await makeFreshRepo();
    repo = fresh.repo;
    cleanup = () => dropRepo(fresh.pool, fresh.table, fresh.eventsTable);

    await repo.save(makeUser("1", "A"));
    await repo.save(makeUser("2", "B"));
    await repo.save(makeUser("3", "C"));
  });

  afterEach(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await closePool();
  });

  itPg("returns ok", async () => {
    const result = await repo.list({ limit: 10, offset: 0 });
    expect(result.isOk()).toBe(true);
  });

  itPg("returns all entities when limit exceeds count", async () => {
    const result = await repo.list({ limit: 10, offset: 0 });
    expect(result._unsafeUnwrap().data).toHaveLength(3);
  });

  itPg("respects limit", async () => {
    const result = await repo.list({ limit: 2, offset: 0 });
    const unwrapped = result._unsafeUnwrap();
    expect(unwrapped.data).toHaveLength(2);
    expect(unwrapped.limit).toBe(2);
  });

  itPg("respects offset", async () => {
    const result = await repo.list({ limit: 10, offset: 2 });
    expect(result._unsafeUnwrap().data).toHaveLength(1);
  });

  itPg("returns empty data when offset exceeds count", async () => {
    const result = await repo.list({ limit: 10, offset: 99 });
    expect(result._unsafeUnwrap().data).toHaveLength(0);
  });

  itPg("echoes limit and offset in the response", async () => {
    const result = await repo.list({ limit: 2, offset: 1 });
    const unwrapped = result._unsafeUnwrap();
    expect(unwrapped.limit).toBe(2);
    expect(unwrapped.offset).toBe(1);
  });
});
