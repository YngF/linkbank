/**
 * Copy an existing SQLite LinkBank database into a PostgreSQL one.
 *
 * The target Postgres schema must already exist. The easiest way to create it
 * is to let the app do it: start LinkBank once with DATABASE_URL pointing at the
 * empty Postgres database (it runs its migrations on boot), then stop it and run
 * this script:
 *
 *   DATABASE_URL=postgres://user:pass@host:5432/linkbank \
 *     node --experimental-strip-types scripts/sqlite-to-postgres.ts path/to/linkbank.db
 *
 * It copies users, branches, bookmarks, sessions and favicons preserving ids,
 * then fixes the Postgres identity sequences so new inserts don't collide. Safe
 * to re-run — it clears the target data tables first (migration history is kept).
 */
import Database from 'better-sqlite3';
import pg from 'pg';

const SQLITE_PATH = process.argv[2] ?? process.env.DATABASE_PATH ?? 'data/linkbank.db';
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('ERROR: set DATABASE_URL to the target Postgres database.');
  process.exit(1);
}

const src = new Database(SQLITE_PATH, { readonly: true });
const pool = new pg.Pool({ connectionString: DATABASE_URL });

// Column lists mirror db/types.ts. Ids are copied as-is to preserve references.
const TABLES: { name: string; cols: string[] }[] = [
  { name: 'users', cols: ['id', 'username', 'email', 'password_hash', 'is_admin', 'created_at'] },
  {
    name: 'branches',
    cols: ['id', 'user_id', 'parent_id', 'name', 'position', 'icon', 'colour', 'is_deleted', 'deleted_at', 'created_at', 'updated_at']
  },
  {
    name: 'bookmarks',
    cols: [
      'id', 'user_id', 'branch_id', 'title', 'url', 'notes', 'position', 'is_deleted', 'deleted_at',
      'link_status', 'link_code', 'link_detail', 'link_checked_at', 'link_ignore', 'created_at', 'updated_at'
    ]
  },
  { name: 'tags', cols: ['id', 'user_id', 'name', 'hue', 'created_at'] },
  { name: 'sessions', cols: ['id', 'user_id', 'expires_at', 'created_at'] },
  { name: 'favicons', cols: ['host', 'data', 'content_type', 'ok', 'is_manual', 'fetched_at'] },
  { name: 'bookmark_tags', cols: ['bookmark_id', 'tag_id'] },
  {
    name: 'invites',
    cols: ['id', 'token_hash', 'created_by', 'email', 'note', 'is_admin', 'expires_at', 'used_at', 'used_by', 'created_at']
  },
  { name: 'api_tokens', cols: ['id', 'user_id', 'name', 'token_hash', 'created_at', 'last_used_at'] }
];

async function main() {
  const client = await pool.connect();
  try {
    const chk = await client.query("SELECT to_regclass('public.bookmarks') AS t");
    if (!chk.rows[0].t) {
      throw new Error(
        'Target schema not found. Start LinkBank once with this DATABASE_URL so it runs its ' +
          'migrations, then re-run this script.'
      );
    }

    await client.query('BEGIN');
    // Clear target data (keep _migrations). Order + CASCADE handle FKs.
    await client.query(
      'TRUNCATE api_tokens, invites, bookmark_tags, tags, favicons, sessions, bookmarks, branches, users RESTART IDENTITY CASCADE'
    );

    const counts: Record<string, number> = {};
    for (const { name, cols } of TABLES) {
      const rows = src.prepare(`SELECT ${cols.join(', ')} FROM ${name}`).all() as Record<string, unknown>[];
      const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
      const stmt = `INSERT INTO ${name} (${cols.join(', ')}) VALUES (${placeholders})`;
      for (const r of rows) {
        await client.query(stmt, cols.map((c) => r[c] ?? null));
      }
      counts[name] = rows.length;
    }

    // IDENTITY columns don't advance on explicit-id inserts — realign them.
    for (const t of ['users', 'branches', 'bookmarks', 'tags', 'invites', 'api_tokens']) {
      await client.query(
        `SELECT setval(pg_get_serial_sequence('${t}', 'id'),
                       GREATEST((SELECT COALESCE(MAX(id), 0) FROM ${t}), 1))`
      );
    }

    await client.query('COMMIT');
    console.log(
      `Copied → users=${counts.users} branches=${counts.branches} bookmarks=${counts.bookmarks} ` +
        `tags=${counts.tags} bookmark_tags=${counts.bookmark_tags} invites=${counts.invites} sessions=${counts.sessions} favicons=${counts.favicons}`
    );
    console.log('Done. Point LinkBank at DATABASE_URL and it will use Postgres.');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

main()
  .then(() => pool.end())
  .then(() => src.close())
  .catch((e) => {
    console.error('Migration failed:', e instanceof Error ? e.message : e);
    process.exit(1);
  });
