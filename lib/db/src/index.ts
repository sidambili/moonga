import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });

/**
 * Run all pending Drizzle migrations from the given folder.
 * Call once at server startup before serving requests.
 *
 * Safe for existing databases that were provisioned via `drizzle-kit push`
 * (which leaves no migration-tracking table). Before calling `migrate()` we
 * check whether the app schema already exists and, if so, record migration
 * 0000 as already applied so `migrate()` only runs the incremental ones.
 * Without this step, `migrate()` would try to re-run CREATE TABLE / CREATE
 * TYPE statements and fail on every existing deployment.
 */
export async function runMigrations(migrationsFolder: string): Promise<void> {
  await baselineIfNeeded(migrationsFolder);
  await migrate(db, { migrationsFolder });
}

/**
 * If the app schema is already deployed (push-based setup) but
 * `drizzle.__drizzle_migrations` has no records, insert the 0000 migration
 * as already-applied so `migrate()` skips it.
 */
async function baselineIfNeeded(migrationsFolder: string): Promise<void> {
  const client = await pool.connect();
  try {
    // Is the app already deployed? Use `events` table as the sentinel.
    const { rows: eventsCheck } = await client.query<{ exists: boolean }>(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'events'
      ) AS exists
    `);
    if (!eventsCheck[0].exists) return; // Fresh database — let migrate() build everything

    // App is deployed. Ensure the drizzle tracking schema + table exist.
    await client.query(`CREATE SCHEMA IF NOT EXISTS drizzle`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
        id SERIAL PRIMARY KEY,
        hash text NOT NULL,
        created_at bigint
      )
    `);

    // If there are already migration records, nothing to do.
    const { rows: existing } = await client.query<{ id: number }>(
      `SELECT id FROM drizzle.__drizzle_migrations LIMIT 1`
    );
    if (existing.length > 0) return;

    // No records — baseline: mark the first migration (0000) as already applied
    // so migrate() doesn't try to re-run CREATE TABLE/TYPE on existing tables.
    const journal = JSON.parse(
      readFileSync(`${migrationsFolder}/meta/_journal.json`, "utf8")
    ) as { entries: Array<{ idx: number; tag: string; when: number }> };

    const first = journal.entries.find((e) => e.idx === 0);
    if (!first) return;

    const sqlContent = readFileSync(`${migrationsFolder}/${first.tag}.sql`, "utf8");
    const hash = crypto.createHash("sha256").update(sqlContent).digest("hex");

    await client.query(
      `INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)`,
      [hash, first.when]
    );
  } finally {
    client.release();
  }
}

export * from "./schema";
export * from "./tenancy";
