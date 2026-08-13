import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { restoreBookmark, restoreBranch } from '$lib/server/mutations';

// POST /api/bulk/restore { bookmarkIds, branchIds } — undo a bulk delete.
export const POST: RequestHandler = async ({ request, locals }) => {
  const uid = locals.userId;
  if (uid == null) return json({ error: 'Not signed in' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const bookmarkIds: number[] = Array.isArray(body.bookmarkIds) ? body.bookmarkIds.map(Number) : [];
  const branchIds: number[] = Array.isArray(body.branchIds) ? body.branchIds.map(Number) : [];

  for (const id of branchIds) {
    try {
      await restoreBranch(uid, id);
    } catch {
      /* skip */
    }
  }
  for (const id of bookmarkIds) {
    try {
      await restoreBookmark(uid, id);
    } catch {
      /* skip */
    }
  }
  return json({ ok: true });
};
