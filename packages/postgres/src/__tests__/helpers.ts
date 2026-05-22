import { describe, it } from "vitest";
import { Pool } from "pg";
import { DomainEntity, DomainEventInterface } from "@ontologic/ontologic";

import { PostgresRepository } from "../postgresRepository";

export interface UserState {
  id: string;
  name: string;
}

export class User extends DomainEntity<UserState> {
  constructor(id: string, version: number, state: UserState) {
    super(id, version, state);
  }

  static fromState(id: string, version: number, state: UserState): User {
    return new User(id, version, state);
  }
}

export function makeUser(id: string, name = "Alice", version = 1): User {
  return new User(id, version, { id, name });
}

export function makeEvent(
  entityId: string,
  name = "UserCreated",
): DomainEventInterface {
  return { name, version: 1, entityId, payload: {} };
}

const TEST_DB_URL = process.env["ONTOLOGIC_PG_TEST_URL"];

/**
 * `it`/`describe` replacements that skip the suite when no test Postgres is
 * configured. Set `ONTOLOGIC_PG_TEST_URL` to a connection string (e.g. a local
 * Docker postgres) to enable the suite.
 */
export const itPg: typeof it = TEST_DB_URL ? it : (it.skip as typeof it);
export const describePg: typeof describe = TEST_DB_URL
  ? describe
  : (describe.skip as typeof describe);

let sharedPool: Pool | undefined;

export function getPool(): Pool {
  if (!TEST_DB_URL) {
    throw new Error(
      "ONTOLOGIC_PG_TEST_URL is not set — getPool() should not be called",
    );
  }
  if (!sharedPool) {
    sharedPool = new Pool({ connectionString: TEST_DB_URL, max: 4 });
  }
  return sharedPool;
}

export async function closePool(): Promise<void> {
  if (sharedPool) {
    await sharedPool.end();
    sharedPool = undefined;
  }
}

let suiteCounter = 0;

/**
 * Build a fresh repository against unique table names so concurrent test files
 * don't trample each other, then run `migrate()`.
 */
export async function makeFreshRepo(): Promise<{
  repo: PostgresRepository<User, DomainEventInterface>;
  table: string;
  eventsTable: string;
  pool: Pool;
}> {
  const pool = getPool();
  suiteCounter += 1;
  const table = `ontologic_pg_test_${process.pid}_${Date.now()}_${suiteCounter}`;
  const eventsTable = `${table}_events`;

  const repo = new PostgresRepository<User, DomainEventInterface>({
    pool,
    table,
    eventsTable,
    mapper: User.fromState,
  });

  const migrateResult = await repo.migrate();
  if (migrateResult.isErr()) {
    throw migrateResult.error;
  }

  return { repo, table, eventsTable, pool };
}

export async function dropRepo(
  pool: Pool,
  table: string,
  eventsTable: string,
): Promise<void> {
  await pool.query(`DROP TABLE IF EXISTS "${eventsTable}";`);
  await pool.query(`DROP TABLE IF EXISTS "${table}";`);
}
