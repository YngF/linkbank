import { sql } from 'kysely';
import { db } from './db/index';
import { resolveHue } from '$lib/tagcolour';
import type { UiTag } from './db/types';

/**
 * Tags: cross-cutting labels on bookmarks, independent of the folder tree.
 * All operations are scoped to a userId. Tag names are matched case-insensitively
 * (so "Work" and "work" are the same tag) but stored as first written.
 */

const MAX_TAGS_PER_BOOKMARK = 20;
const MAX_NAME_LEN = 40;

function nowIso() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

/** All of a user's tags with bookmark counts, ordered by name. */
export async function listTags(userId: number): Promise<UiTag[]> {
  const rows = await db
    .selectFrom('tags')
    .leftJoin('bookmark_tags', 'bookmark_tags.tag_id', 'tags.id')
    .leftJoin('bookmarks', (join) =>
      join.onRef('bookmarks.id', '=', 'bookmark_tags.bookmark_id').on('bookmarks.is_deleted', '=', 0)
    )
    .select([
      'tags.id as id',
      'tags.name as name',
      'tags.hue as hue',
      sql<number>`count(bookmarks.id)`.as('count')
    ])
    .where('tags.user_id', '=', userId)
    .groupBy(['tags.id', 'tags.name', 'tags.hue'])
    .execute();

  return rows
    .map((r) => ({ id: r.id, name: r.name, hue: resolveHue(r.name, r.hue), count: Number(r.count) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Tags for a single tag id (owner-checked); null if not found. */
export async function getTag(userId: number, id: number): Promise<UiTag | null> {
  const t = await db
    .selectFrom('tags')
    .select(['id', 'name', 'hue'])
    .where('id', '=', id)
    .where('user_id', '=', userId)
    .executeTakeFirst();
  return t ? { id: t.id, name: t.name, hue: resolveHue(t.name, t.hue) } : null;
}

/** Resolve tag names to ids for a user, creating any that don't exist yet. */
async function ensureTags(userId: number, names: string[]): Promise<number[]> {
  const clean = [...new Set(names.map((n) => n.trim()).filter(Boolean).map((n) => n.slice(0, MAX_NAME_LEN)))].slice(
    0,
    MAX_TAGS_PER_BOOKMARK
  );
  if (clean.length === 0) return [];

  const existing = await db
    .selectFrom('tags')
    .select(['id', 'name'])
    .where('user_id', '=', userId)
    .execute();
  const byLower = new Map(existing.map((t) => [t.name.toLowerCase(), t.id]));

  const ids: number[] = [];
  for (const name of clean) {
    const hit = byLower.get(name.toLowerCase());
    if (hit != null) {
      ids.push(hit);
      continue;
    }
    const res = await db
      .insertInto('tags')
      .values({ user_id: userId, name, hue: null, created_at: nowIso() })
      .returning('id')
      .executeTakeFirstOrThrow();
    const id = Number(res.id);
    byLower.set(name.toLowerCase(), id);
    ids.push(id);
  }
  return ids;
}

/** Replace a bookmark's tag set with the given names (creating tags as needed). */
export async function setBookmarkTags(userId: number, bookmarkId: number, names: string[]): Promise<void> {
  // Ownership check.
  const owned = await db
    .selectFrom('bookmarks')
    .select('id')
    .where('id', '=', bookmarkId)
    .where('user_id', '=', userId)
    .executeTakeFirst();
  if (!owned) return;

  const tagIds = await ensureTags(userId, names);
  await db.transaction().execute(async (trx) => {
    await trx.deleteFrom('bookmark_tags').where('bookmark_id', '=', bookmarkId).execute();
    if (tagIds.length) {
      await trx
        .insertInto('bookmark_tags')
        .values(tagIds.map((tag_id) => ({ bookmark_id: bookmarkId, tag_id })))
        .execute();
    }
  });
  await pruneOrphans(userId);
}

/** Tags for a set of bookmark ids, grouped by bookmark id (for enrichment). */
export async function tagsForBookmarks(
  userId: number,
  bookmarkIds: number[]
): Promise<Map<number, UiTag[]>> {
  const out = new Map<number, UiTag[]>();
  if (bookmarkIds.length === 0) return out;
  const rows = await db
    .selectFrom('bookmark_tags')
    .innerJoin('tags', 'tags.id', 'bookmark_tags.tag_id')
    .select(['bookmark_tags.bookmark_id as bid', 'tags.id as id', 'tags.name as name', 'tags.hue as hue'])
    .where('tags.user_id', '=', userId)
    .where('bookmark_tags.bookmark_id', 'in', bookmarkIds)
    .execute();
  for (const r of rows) {
    const list = out.get(r.bid) ?? [];
    list.push({ id: r.id, name: r.name, hue: resolveHue(r.name, r.hue) });
    out.set(r.bid, list);
  }
  for (const list of out.values()) list.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

export async function renameTag(userId: number, id: number, name: string): Promise<{ ok: boolean; error?: string }> {
  const n = name.trim().slice(0, MAX_NAME_LEN);
  if (!n) return { ok: false, error: 'Tag name cannot be empty' };
  // Reject a name that collides (case-insensitively) with another tag.
  const clash = await db
    .selectFrom('tags')
    .select('id')
    .where('user_id', '=', userId)
    .where('id', '!=', id)
    .where(sql`lower(name)`, '=', n.toLowerCase())
    .executeTakeFirst();
  if (clash) return { ok: false, error: 'A tag with that name already exists' };
  await db.updateTable('tags').set({ name: n }).where('id', '=', id).where('user_id', '=', userId).execute();
  return { ok: true };
}

export async function setTagHue(userId: number, id: number, hue: number | null): Promise<void> {
  const h = hue == null ? null : ((Math.round(hue) % 360) + 360) % 360;
  await db.updateTable('tags').set({ hue: h }).where('id', '=', id).where('user_id', '=', userId).execute();
}

export async function deleteTag(userId: number, id: number): Promise<void> {
  await db.transaction().execute(async (trx) => {
    await trx.deleteFrom('bookmark_tags').where('tag_id', '=', id).execute();
    await trx.deleteFrom('tags').where('id', '=', id).where('user_id', '=', userId).execute();
  });
}

export interface TaggedBookmark {
  id: number;
  title: string;
  url: string;
  branch_id: number;
  path: string;
}

/** All (live) bookmarks carrying a given tag, with their folder path. */
export async function listBookmarksByTag(userId: number, tagId: number): Promise<TaggedBookmark[]> {
  const branches = await db
    .selectFrom('branches')
    .select(['id', 'name', 'parent_id'])
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

  const rows = await db
    .selectFrom('bookmark_tags')
    .innerJoin('bookmarks', 'bookmarks.id', 'bookmark_tags.bookmark_id')
    .select(['bookmarks.id as id', 'bookmarks.title as title', 'bookmarks.url as url', 'bookmarks.branch_id as branch_id'])
    .where('bookmark_tags.tag_id', '=', tagId)
    .where('bookmarks.user_id', '=', userId)
    .where('bookmarks.is_deleted', '=', 0)
    .execute();

  return rows
    .map((r) => ({ id: r.id, title: r.title, url: r.url, branch_id: r.branch_id, path: pathStr(r.branch_id) }))
    .sort((a, b) => a.title.localeCompare(b.title));
}

/** Add one or more tags (by name, creating as needed) to many bookmarks. */
export async function addTagsToBookmarks(userId: number, bookmarkIds: number[], names: string[]): Promise<void> {
  if (!bookmarkIds.length) return;
  const tagIds = await ensureTags(userId, names);
  if (!tagIds.length) return;
  const owned = await db
    .selectFrom('bookmarks')
    .select('id')
    .where('user_id', '=', userId)
    .where('id', 'in', bookmarkIds)
    .where('is_deleted', '=', 0)
    .execute();
  const rows: { bookmark_id: number; tag_id: number }[] = [];
  for (const b of owned) for (const tid of tagIds) rows.push({ bookmark_id: b.id, tag_id: tid });
  if (!rows.length) return;
  await db
    .insertInto('bookmark_tags')
    .values(rows)
    .onConflict((oc) => oc.columns(['bookmark_id', 'tag_id']).doNothing())
    .execute();
}

/** Remove one or more tags (by name) from many bookmarks. */
export async function removeTagsFromBookmarks(userId: number, bookmarkIds: number[], names: string[]): Promise<void> {
  if (!bookmarkIds.length || !names.length) return;
  const existing = await db.selectFrom('tags').select(['id', 'name']).where('user_id', '=', userId).execute();
  const wanted = new Set(names.map((n) => n.trim().toLowerCase()));
  const tagIds = existing.filter((t) => wanted.has(t.name.toLowerCase())).map((t) => t.id);
  if (!tagIds.length) return;
  await db
    .deleteFrom('bookmark_tags')
    .where('tag_id', 'in', tagIds)
    .where('bookmark_id', 'in', bookmarkIds)
    .execute();
  await pruneOrphans(userId);
}

/** Remove a single tag from a single bookmark (owner-checked via the tag). */
export async function removeTagFromBookmark(userId: number, tagId: number, bookmarkId: number): Promise<void> {
  const owns = await db
    .selectFrom('tags')
    .select('id')
    .where('id', '=', tagId)
    .where('user_id', '=', userId)
    .executeTakeFirst();
  if (!owns) return;
  await db.deleteFrom('bookmark_tags').where('tag_id', '=', tagId).where('bookmark_id', '=', bookmarkId).execute();
  await pruneOrphans(userId);
}

/** Remove tags that no longer label any (live) bookmark. Keeps the list tidy. */
async function pruneOrphans(userId: number): Promise<void> {
  await sql`
    DELETE FROM tags
    WHERE user_id = ${userId}
      AND id NOT IN (SELECT tag_id FROM bookmark_tags)
  `.execute(db);
}
