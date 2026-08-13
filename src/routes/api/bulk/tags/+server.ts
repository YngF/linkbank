import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { addTagsToBookmarks, removeTagsFromBookmarks } from '$lib/server/tags';

// POST /api/bulk/tags { bookmarkIds, add: string[], remove: string[] }
export const POST: RequestHandler = async ({ request, locals }) => {
  const uid = locals.userId;
  if (uid == null) return json({ error: 'Not signed in' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const bookmarkIds: number[] = Array.isArray(body.bookmarkIds) ? body.bookmarkIds.map(Number) : [];
  const add: string[] = Array.isArray(body.add) ? body.add.map(String) : [];
  const remove: string[] = Array.isArray(body.remove) ? body.remove.map(String) : [];

  if (remove.length) await removeTagsFromBookmarks(uid, bookmarkIds, remove);
  if (add.length) await addTagsToBookmarks(uid, bookmarkIds, add);
  return json({ ok: true });
};
