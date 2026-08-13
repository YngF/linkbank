import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { removeTagFromBookmark } from '$lib/server/tags';

// DELETE /api/tags/[id]/bookmarks/[bid] — untag one bookmark.
export const DELETE: RequestHandler = async ({ params, locals }) => {
  const userId = locals.userId;
  if (userId == null) return json({ error: 'Not signed in' }, { status: 401 });
  await removeTagFromBookmark(userId, Number(params.id), Number(params.bid));
  return json({ ok: true });
};
