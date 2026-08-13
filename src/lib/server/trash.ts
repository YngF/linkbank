import { sql } from 'kysely';
import { db } from './db/index';
import { env } from '$env/dynamic/private';
import { decryptNote } from './notes-crypto';

/** How long trashed items are kept before automatic purge. */
const RETENTION_DAYS = Number(env.TRASH_RETENTION_DAYS ?? '30') || 30;

export interface TrashItem {
  kind: 'bookmark' | 'folder';
  id: number;
  title: string;
  url: string | null;
  path: string;
  deleted_at: string | null;
}

/** List a user's trashed folders and bookmarks, newest first, with folder path. */
export async function listTrash(userId: number): Promise<TrashItem[]> {
  const branches = await db
    .selectFrom('branches')
    .select(['id', 'name', 'parent_id', 'is_deleted', 'deleted_at'])
    .where('user_id', '=', userId)
    .execute();
  const byId = new Map(branches.map((b) => [b.id, b]));
  const pathStr = (id: number | null): string => {
    const out: string[] = [];
    let cur = id;
    while (cur != null) {
      const n = byId.get(cur);
      if (!n) break;
      out.unshift(n.name);
      cur = n.parent_id;
    }
    return out.slice(1).join(' / ');
  };

  const folders: TrashItem[] = branches
    .filter((b) => b.is_deleted === 1)
    .map((b) => ({ kind: 'folder', id: b.id, title: b.name, url: null, path: pathStr(b.parent_id), deleted_at: b.deleted_at }));

  const bmRows = await db
    .selectFrom('bookmarks')
    .select(['id', 'title', 'url', 'branch_id', 'deleted_at'])
    .where('user_id', '=', userId)
    .where('is_deleted', '=', 1)
    .execute();
  const bookmarks: TrashItem[] = bmRows.map((m) => ({
    kind: 'bookmark',
    id: m.id,
    title: m.title,
    url: m.url,
    path: pathStr(m.branch_id),
    deleted_at: m.deleted_at
  }));

  return [...folders, ...bookmarks].sort((a, b) => (b.deleted_at ?? '').localeCompare(a.deleted_at ?? ''));
}

/** Purge trashed items older than the retention window. Runs on boot. */
export async function purgeOldTrash(): Promise<void> {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 864e5).toISOString().replace('T', ' ').slice(0, 19);
  const r1 = await db
    .deleteFrom('bookmarks')
    .where('is_deleted', '=', 1)
    .where('deleted_at', 'is not', null)
    .where('deleted_at', '<', cutoff)
    .executeTakeFirst();
  const r2 = await db
    .deleteFrom('branches')
    .where('is_deleted', '=', 1)
    .where('deleted_at', 'is not', null)
    .where('deleted_at', '<', cutoff)
    .executeTakeFirst();
  const n = Number(r1.numDeletedRows ?? 0) + Number(r2.numDeletedRows ?? 0);
  if (n > 0) console.log(`[trash] purged ${n} item(s) older than ${RETENTION_DAYS} days.`);
}

/** Count of items in a user's trash (for the sidebar badge). */
export async function trashCount(userId: number): Promise<number> {
  const b = await db.selectFrom('bookmarks').select(sql<number>`count(*)`.as('c')).where('user_id', '=', userId).where('is_deleted', '=', 1).executeTakeFirst();
  const f = await db.selectFrom('branches').select(sql<number>`count(*)`.as('c')).where('user_id', '=', userId).where('is_deleted', '=', 1).executeTakeFirst();
  return Number(b?.c ?? 0) + Number(f?.c ?? 0);
}
