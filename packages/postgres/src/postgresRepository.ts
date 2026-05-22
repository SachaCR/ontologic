import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";

import format from "pg-format";

import {
  ConcurrentWriteError,
  DomainEntity,
  DomainEventInterface,
  EventWithMetadata,
  Repository,
  Result,
  err,
  ok,
} from "@ontologic/ontologic";

import type { Pool, PoolClient } from "pg";

export interface PostgresRepositoryOptions<
  Entity extends DomainEntity<ReturnType<Entity["readState"]>>,
> {
  /** A `pg.Pool` owned by the caller. */
  pool: Pool;
  /** Entity table name. Also the prefix of the events table by default. */
  table: string;
  /** Optional events table name. Defaults to `<table>_events`. */
  eventsTable?: string;
  /** Optional Postgres schema. Defaults to the search path. */
  schema?: string;
  /** Rehydrates an entity from its persisted state. */
  mapper: (
    id: string,
    version: number,
    state: ReturnType<Entity["readState"]>,
  ) => Entity;
}

export class PostgresRepository<
  Entity extends DomainEntity<ReturnType<Entity["readState"]>>,
  Event extends DomainEventInterface,
> implements Repository<Entity, Event> {
  readonly #pool: Pool;
  readonly #mapper: (
    id: string,
    version: number,
    state: ReturnType<Entity["readState"]>,
  ) => Entity;
  readonly #entityTable: string;
  readonly #eventsTable: string;
  readonly #emitter = new EventEmitter({ captureRejections: true });

  constructor(options: PostgresRepositoryOptions<Entity>) {
    this.#pool = options.pool;
    this.#mapper = options.mapper;
    const schemaPrefix = options.schema
      ? `${format.ident(options.schema)}.`
      : "";
    this.#entityTable = `${schemaPrefix}${format.ident(options.table)}`;
    this.#eventsTable = `${schemaPrefix}${format.ident(
      options.eventsTable ?? `${options.table}_events`,
    )}`;
  }

  async migrate(): Promise<Result<void, Error>> {
    try {
      await this.#pool.query(`
        CREATE TABLE IF NOT EXISTS ${this.#entityTable} (
          id text PRIMARY KEY,
          state jsonb NOT NULL,
          version integer NOT NULL DEFAULT 1,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        );
      `);

      await this.#pool.query(`
        CREATE TABLE IF NOT EXISTS ${this.#eventsTable} (
          id uuid PRIMARY KEY,
          entity_id text NOT NULL,
          name text NOT NULL,
          version integer NOT NULL,
          payload jsonb NOT NULL,
          event_offset bigint NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now(),
          UNIQUE (entity_id, event_offset)
        );
      `);

      await this.#pool.query(
        `CREATE INDEX IF NOT EXISTS ${format.ident(
          `${stripSchema(this.#eventsTable)}_entity_offset_idx`,
        )} ON ${this.#eventsTable} (entity_id, event_offset);`,
      );

      return ok();
    } catch (error) {
      return err(toError(error));
    }
  }

  async save(
    entity: Entity,
  ): Promise<Result<void, ConcurrentWriteError | Error>> {
    const entityId = entity.id();
    const previousVersion = entity.version();

    try {
      const upsertResult =
        previousVersion === 0
          ? // Creation: fresh entity (v=0). Refuse to touch an existing row —
            // a conflict here is a real concurrent-create collision, not an
            // update. Successful insert lands the row at v=1.
            await this.#pool.query<{ version: number }>(
              `
              INSERT INTO ${this.#entityTable}
                (id, state, version, created_at, updated_at)
              VALUES ($1, $2, $3, now(), now())
              ON CONFLICT (id) DO NOTHING
              RETURNING version;
              `,
              [entityId, JSON.stringify(entity.readState()), 1],
            )
          : // Update: row should exist at exactly `previousVersion`.
            await this.#pool.query<{ version: number }>(
              `
              INSERT INTO ${this.#entityTable}
                (id, state, version, created_at, updated_at)
              VALUES ($1, $2, $3, now(), now())
              ON CONFLICT (id) DO UPDATE
                SET state = EXCLUDED.state,
                    version = ${this.#entityTable}.version + 1,
                    updated_at = now()
                WHERE ${this.#entityTable}.version = $3
              RETURNING version;
              `,
              [entityId, JSON.stringify(entity.readState()), previousVersion],
            );

      const row = upsertResult.rows[0];
      if (!row) {
        return err(
          new ConcurrentWriteError({
            entityId,
            expectedVersion: previousVersion,
          }),
        );
      }

      entity.setVersion(row.version);

      return ok();
    } catch (error) {
      return err(toError(error));
    }
  }

  async saveWithEvents(
    entity: Entity,
    domainEvents: Event | Event[],
  ): Promise<Result<void, ConcurrentWriteError | Error>> {
    const events = Array.isArray(domainEvents) ? domainEvents : [domainEvents];
    const entityId = entity.id();
    const previousVersion = entity.version();

    let client: PoolClient | undefined;

    try {
      client = await this.#pool.connect();
      await client.query("BEGIN");

      const upsertResult =
        previousVersion === 0
          ? // Creation: fresh entity (v=0). Refuse to touch an existing row —
            // a conflict here is a real concurrent-create collision, not an
            // update. Successful insert lands the row at v=1.
            await client.query<{ version: number }>(
              `
              INSERT INTO ${this.#entityTable}
                (id, state, version, created_at, updated_at)
              VALUES ($1, $2, $3, now(), now())
              ON CONFLICT (id) DO NOTHING
              RETURNING version;
              `,
              [entityId, JSON.stringify(entity.readState()), 1],
            )
          : // Update: row should exist at exactly `previousVersion`.
            await client.query<{ version: number }>(
              `
              INSERT INTO ${this.#entityTable}
                (id, state, version, created_at, updated_at)
              VALUES ($1, $2, $3, now(), now())
              ON CONFLICT (id) DO UPDATE
                SET state = EXCLUDED.state,
                    version = ${this.#entityTable}.version + 1,
                    updated_at = now()
                WHERE ${this.#entityTable}.version = $3
              RETURNING version;
              `,
              [entityId, JSON.stringify(entity.readState()), previousVersion],
            );

      const upsertRow = upsertResult.rows[0];

      if (!upsertRow) {
        throw new ConcurrentWriteError({
          entityId,
          expectedVersion: previousVersion,
        });
      }

      const newVersion = upsertRow.version;

      if (events.length > 0) {
        const lastOffsetRes = await client.query<{
          last_offset: string | null;
        }>(
          `
          SELECT MAX(event_offset) AS last_offset
          FROM ${this.#eventsTable}
          WHERE entity_id = $1;
          `,
          [entityId],
        );

        const lastEventOffset =
          lastOffsetRes.rows[0]?.last_offset == null
            ? -1
            : Number(lastOffsetRes.rows[0].last_offset);

        // Build one tuple per event. pg-format's `%L` escapes every value as a
        // SQL literal, so the events INSERT is safe even though it's built as
        // a single statement string instead of a parameterized query.
        const rows = events.map((event, index) => [
          randomUUID(),
          event.entityId,
          event.name,
          event.version,
          JSON.stringify(event.payload ?? null),
          lastEventOffset + 1 + index,
        ]);

        // `this.#eventsTable` is already escaped via `format.ident` at
        // construction time, so we pass it through `%s` (raw) rather than
        // `%I` (which would double-quote it).
        const insertSql = format(
          `INSERT INTO %s
             (id, entity_id, name, version, payload, event_offset)
           VALUES %L;`,
          this.#eventsTable,
          rows,
        );

        await client.query(insertSql);
      }

      await client.query("COMMIT");

      entity.setVersion(newVersion);

      this.#emitter.emit("domainEventsSaved", entityId);

      return ok();
    } catch (error) {
      if (client) {
        try {
          await client.query("ROLLBACK");
        } catch {
          // ignore rollback errors and surface the original one
        }
      }

      return err(toError(error));
    } finally {
      client?.release();
    }
  }

  async getById(id: string): Promise<Result<Entity | undefined, Error>> {
    try {
      const res = await this.#pool.query<{
        version: number;
        state: ReturnType<Entity["readState"]>;
      }>(`SELECT version, state FROM ${this.#entityTable} WHERE id = $1;`, [
        id,
      ]);

      const row = res.rows[0];

      if (!row) {
        return ok(undefined);
      }

      return ok(this.#mapper(id, row.version, row.state));
    } catch (error) {
      return err(toError(error));
    }
  }

  async list(params: {
    limit: number;
    offset: number;
  }): Promise<
    Result<{ limit: number; offset: number; data: Entity[] }, Error>
  > {
    try {
      const res = await this.#pool.query<{
        id: string;
        version: number;
        state: ReturnType<Entity["readState"]>;
      }>(
        `
        SELECT id, version, state
        FROM ${this.#entityTable}
        ORDER BY created_at ASC, id ASC
        LIMIT $1 OFFSET $2;
        `,
        [params.limit, params.offset],
      );

      const data = res.rows.map((row) =>
        this.#mapper(row.id, row.version, row.state),
      );
      return ok({ limit: params.limit, offset: params.offset, data });
    } catch (error) {
      return err(toError(error));
    }
  }

  async getEvents(
    entityId: string,
    options?: { limit: number; offset: number },
  ): Promise<Result<EventWithMetadata<Event>[], Error>> {
    const { limit, offset } = options ?? { limit: 100, offset: 0 };

    try {
      const res = await this.#pool.query<EventRow>(
        `
        SELECT id, entity_id, name, version, payload, event_offset, created_at
        FROM ${this.#eventsTable}
        WHERE entity_id = $1
        ORDER BY event_offset ASC
        LIMIT $2 OFFSET $3;
        `,
        [entityId, limit, offset],
      );

      return ok(
        res.rows.map(rowToEventWithMetadata) as EventWithMetadata<Event>[],
      );
    } catch (error) {
      return err(toError(error));
    }
  }

  async getEventsAfter(
    entityId: string,
    eventId: string | undefined,
    limit: number = 50,
  ): Promise<Result<EventWithMetadata<Event>[], Error>> {
    try {
      // Mirror InMemoryRepository: when `eventId` is undefined or unknown,
      // return events starting from the beginning (offset 0).
      let startOffset = 0;
      if (eventId !== undefined) {
        const lookup = await this.#pool.query<{ event_offset: string }>(
          `SELECT event_offset FROM ${this.#eventsTable}
           WHERE entity_id = $1 AND id = $2;`,
          [entityId, eventId],
        );
        const row = lookup.rows[0];
        if (row) {
          startOffset = Number(row.event_offset);
        }
      }

      const res = await this.#pool.query<EventRow>(
        `
        SELECT id, entity_id, name, version, payload, event_offset, created_at
        FROM ${this.#eventsTable}
        WHERE entity_id = $1 AND event_offset >= $2
        ORDER BY event_offset ASC
        LIMIT $3;
        `,
        [entityId, startOffset, limit],
      );

      return ok(
        res.rows.map(rowToEventWithMetadata) as EventWithMetadata<Event>[],
      );
    } catch (error) {
      return err(toError(error));
    }
  }

  onChanges(handler: (entityId: string) => void): void {
    this.#emitter.on("domainEventsSaved", handler);
  }
}

interface EventRow {
  id: string;
  entity_id: string;
  name: string;
  version: number;
  payload: unknown;
  event_offset: string;
  created_at: Date;
}

function rowToEventWithMetadata(
  row: EventRow,
): EventWithMetadata<DomainEventInterface> {
  return {
    event: {
      entityId: row.entity_id,
      name: row.name,
      version: row.version,
      payload: row.payload,
    },
    metadata: {
      id: row.id,
      offset: Number(row.event_offset),
      createdAt:
        row.created_at instanceof Date
          ? row.created_at.toISOString()
          : String(row.created_at),
    },
  };
}

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

function stripSchema(qualified: string): string {
  // Used only to derive an index name from an already-quoted identifier.
  const last = qualified.split(".").pop() ?? qualified;
  return last.replace(/^"|"$/g, "").replace(/""/g, '"');
}
