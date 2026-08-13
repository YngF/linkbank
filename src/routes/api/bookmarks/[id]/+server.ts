import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { handle } from '$lib/server/respond';
import { updateBookmark, deleteBookmark, purgeBookmark } from '$lib/server/mutations';
import { db } from '$lib/server/db/index';
import { decryptNote } from '$lib/server/notes-crypto';
import { tagsForBookmarks } from '$lib/server/tags';

// Fetch a single bookmark (owner only), with its note decrypted and tags — used
// e.g. to open a note card from search, where the search API omits note contents.
export const GET: RequestHandler = async ({ params, locals }) => {
  const userId = locals.userId;
  if (userId == null) return json({ error: 'Not signed in' }, { status: 401 });
  const id = Number(params.id);
  const row = await db
    .selectFrom('bookmarks')
    .select(['id', 'title', 'url', 'notes', 'branch_id', 'link_ignore'])
    .where('id', '=', id)
    .where('user_id', '=', userId)
    .where('is_deleted', '=', 0)
    .executeTakeFirst();
  if (!row) return json({ error: 'Not found' }, { status: 404 });
  const tags = (await tagsForBookmarks(userId, [row.id])).get(row.id) ?? [];
  return json({
    id: row.id,
    title: row.title,
    url: row.url,
    notes: decryptNote(row.notes) ?? '',
    branchId: row.branch_id,
    linkIgnore: !!row.link_ignore,
    tags
  });
};

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
  const body = await request.json();
  const id = Number(params.id);
  return handle(locals.userId, (uid) =>
    updateBookmark(uid, id, {
      title: body.title,
      url: body.url,
      notes: body.notes,
      branchId: body.branchId !== undefined ? Number(body.branchId) : undefined,
      linkIgnore: body.linkIgnore,
      tags: Array.isArray(body.tags) ? body.tags.map(String) : undefined
    })
  );
};

export const DELETE: RequestHandler = async ({ params, url, locals }) => {
  const id = Number(params.id);
  const hard = url.searchParams.get('hard') === '1';
  return handle(locals.userId, (uid) => (hard ? purgeBookmark(uid, id) : deleteBookmark(uid, id)));
};
