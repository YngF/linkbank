import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/index';
import { decryptNote } from '$lib/server/notes-crypto';
import { listTags } from '$lib/server/tags';

/**
 * Search a user's folders (by name) and bookmarks (by title, URL, and notes).
 * Notes are matched but never returned — they may hold passwords, so they stay
 * server-side. Each result carries its folder path for context.
 *
 * Matching is done in JS (not SQL LIKE) so case-insensitivity works for
 * non-ASCII letters like æ/ø/å, which SQLite's LIKE/lower() do not fold.
 * A few hundred rows is trivial to scan.
 */
export const GET: RequestHandler = async ({ url, locals }) => {
  const userId = locals.userId;
  if (userId == null) return json({ error: 'Not signed in' }, { status: 401 });

  const q = (url.searchParams.get('q') ?? '').trim();
  if (q.length < 1) return json({ folders: [], bookmarks: [], tags: [] });
  const ql = q.toLowerCase();

  // Tag names per bookmark (so a bookmark matches on its tags too), plus tag hits.
  const allTags = await listTags(userId);
  const tagHits = allTags
    .filter((t) => t.name.toLowerCase().includes(ql))
    .sort((a, b) => rank(a.name, ql) - rank(b.name, ql) || a.name.localeCompare(b.name))
    .slice(0, 10);

  const btRows = await db
    .selectFrom('bookmark_tags')
    .innerJoin('tags', 'tags.id', 'bookmark_tags.tag_id')
    .select(['bookmark_tags.bookmark_id as bid', 'tags.name as name'])
    .where('tags.user_id', '=', userId)
    .execute();
  const tagNamesByBid = new Map<number, string[]>();
  for (const r of btRows) {
    const list = tagNamesByBid.get(r.bid) ?? [];
    list.push(r.name);
    tagNamesByBid.set(r.bid, list);
  }

  const branches = await db
    .selectFrom('branches')
    .select(['id', 'name', 'parent_id'])
    .where('user_id', '=', userId)
    .where('is_deleted', '=', 0)
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
    return out.slice(1).join(' / '); // drop the root (username) for brevity
  };

  const folders = branches
    .filter((b) => b.parent_id !== null && b.name.toLowerCase().includes(ql))
    .map((b) => ({ id: b.id, name: b.name, path: pathStr(b.parent_id) }))
    .sort((a, b) => rank(a.name, ql) - rank(b.name, ql) || a.name.localeCompare(b.name))
    .slice(0, 15);

  const bmRows = await db
    .selectFrom('bookmarks')
    .select(['id', 'title', 'url', 'notes', 'branch_id'])
    .where('user_id', '=', userId)
    .where('is_deleted', '=', 0)
    .execute();

  const bookmarks = bmRows
    .filter((b) => {
      const tagStr = (tagNamesByBid.get(b.id) ?? []).join(' ');
      // decrypt notes only to match; the plaintext is never returned
      return `${b.title} ${b.url} ${tagStr} ${decryptNote(b.notes) ?? ''}`.toLowerCase().includes(ql);
    })
    .map((b) => ({
      id: b.id,
      title: b.title,
      url: b.url,
      branchId: b.branch_id,
      path: pathStr(b.branch_id)
      // notes intentionally omitted from the response
    }))
    .sort((a, b) => rank(a.title, ql) - rank(b.title, ql) || a.title.localeCompare(b.title))
    .slice(0, 40);

  return json({ folders, bookmarks, tags: tagHits });
};

// Title/name that equals the query ranks first, then starts-with, then contains.
function rank(text: string, ql: string) {
  const t = text.toLowerCase();
  if (t === ql) return 0;
  if (t.startsWith(ql)) return 1;
  if (t.includes(ql)) return 2;
  return 3;
}
