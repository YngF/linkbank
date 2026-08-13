import Database from 'better-sqlite3';
import { Kysely, SqliteDialect, PostgresDialect } from 'kysely';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
import { env } from '$env/dynamic/private';
import type { Database as DB } from './types';

/**
 * Single database handle for the process.
 *
 * The dialect is chosen at boot from the environment:
 *   - DATABASE_URL set  → PostgreSQL (pg pool)
 *   - otherwise         → SQLite (better-sqlite3), file at DATABASE_PATH
 *
 * The query code and the schema types (db/types.ts) are identical for both;
 * only this file and the DDL in migrate.ts know which engine is in use.
 *
 * `pg` is loaded lazily (runtime require) only when DATABASE_URL is set, so a
 * SQLite-only deployment doesn't need the `pg` package installed at all — and
 * the bundler never has to resolve it at build time.
 */
export type DialectName = 'postgres' | 'sqlite';

export const DIALECT: DialectName = env.DATABASE_URL ? 'postgres' : 'sqlite';

function makeDb(): Kysely<DB> {
  if (DIALECT === 'postgres') {
    let pg: typeof import('pg');
    try {
      pg = createRequire(import.meta.url)('pg');
    } catch {
      throw new Error(
        'DATABASE_URL is set but the "pg" package is not installed. Run `npm install pg` ' +
          '(it ships as a dependency, so a normal install includes it).'
      );
    }
    const pool = new pg.Pool({
      connectionString: env.DATABASE_URL,
      max: Number(env.DATABASE_POOL_MAX ?? '10') || 10
    });
    return new Kysely<DB>({ dialect: new PostgresDialect({ pool }) });
  }

  const DB_PATH = env.DATABASE_PATH || 'data/linkbank.db';
  mkdirSync(dirname(DB_PATH), { recursive: true });

  const sqlite = new Database(DB_PATH);
  sqlite.pragma('journal_mode = WAL'); // better concurrency for a web app
  sqlite.pragma('busy_timeout = 5000'); // wait for locks instead of erroring (SQLITE_BUSY)
  sqlite.pragma('foreign_keys = ON'); // enforce the tree integrity we designed

  return new Kysely<DB>({ dialect: new SqliteDialect({ database: sqlite }) });
}

export const db = makeDb();

export type { DB };
