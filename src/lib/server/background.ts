import { db } from './db/index';

/**
 * Per-user custom background image (shown behind the folder tree + bookmarks).
 * Stored as a BLOB in the DB and served from the /background route, so it works
 * the same on SQLite and Postgres with no filesystem paths to manage.
 */

const now = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

/** Accept common web raster formats; verify by magic bytes, fall back to type. */
export function sniffBackground(data: Uint8Array, declared?: string): string | null {
  if (data[0] === 0x89 && data[1] === 0x50) return 'image/png';
  if (data[0] === 0xff && data[1] === 0xd8) return 'image/jpeg';
  if (data[0] === 0x47 && data[1] === 0x49) return 'image/gif';
  // WEBP: "RIFF"<4 bytes>"WEBP"
  if (
    data[0] === 0x52 && data[1] === 0x49 && data[2] === 0x46 && data[3] === 0x46 &&
    data[8] === 0x57 && data[9] === 0x45 && data[10] === 0x42 && data[11] === 0x50
  )
    return 'image/webp';
  const ct = (declared ?? '').split(';')[0].trim().toLowerCase();
  if (['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(ct)) return ct;
  return null;
}

export interface Background {
  data: Uint8Array;
  contentType: string;
  updatedAt: string;
}

export async function getBackground(userId: number): Promise<Background | null> {
  const row = await db
    .selectFrom('backgrounds')
    .select(['data', 'content_type', 'updated_at'])
    .where('user_id', '=', userId)
    .executeTakeFirst();
  if (!row || !row.data) return null;
  return { data: row.data, contentType: row.content_type, updatedAt: row.updated_at };
}

/** The version token only (cache-buster) — doesn't load the image bytes. */
export async function getBackgroundVersion(userId: number): Promise<string | null> {
  const row = await db
    .selectFrom('backgrounds')
    .select('updated_at')
    .where('user_id', '=', userId)
    .executeTakeFirst();
  return row?.updated_at ?? null;
}

export async function setBackground(
  userId: number,
  data: Uint8Array,
  contentType: string
): Promise<void> {
  const updated_at = now();
  await db
    .insertInto('backgrounds')
    .values({ user_id: userId, data, content_type: contentType, updated_at })
    .onConflict((oc) => oc.column('user_id').doUpdateSet({ data, content_type: contentType, updated_at }))
    .execute();
}

export async function deleteBackground(userId: number): Promise<void> {
  await db.deleteFrom('backgrounds').where('user_id', '=', userId).execute();
}
