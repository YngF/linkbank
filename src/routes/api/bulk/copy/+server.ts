import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { copyBookmark } from '$lib/server/mutations';

// POST /api/bulk/copy { bookmarkIds, toBranchId } — duplicate bookmarks into a folder.
export const POST: RequestHandler = async ({ request, locals }) => {
  const uid = locals.userId;
  if (uid == null) return json({ error: 'Not signed in' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const toBranchId = Number(body.toBranchId);
  const bookmarkIds: number[] = Array.isArray(body.bookmarkIds) ? body.bookmarkIds.map(Number) : [];
  if (!Number.isInteger(toBranchId)) return json({ error: 'Bad target folder' }, { status: 400 });

  let copied = 0;
  for (const id of bookmarkIds) {
    try {
      await copyBookmark(uid, id, toBranchId);
      copied++;
    } catch {
      /* skip */
    }
  }
  return json({ ok: true, copied });
};
