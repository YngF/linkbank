import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { moveBookmark, moveBranch, MutationError } from '$lib/server/mutations';

// POST /api/bulk/move { bookmarkIds, branchIds, toBranchId }
export const POST: RequestHandler = async ({ request, locals }) => {
  const uid = locals.userId;
  if (uid == null) return json({ error: 'Not signed in' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const toBranchId = Number(body.toBranchId);
  const bookmarkIds: number[] = Array.isArray(body.bookmarkIds) ? body.bookmarkIds.map(Number) : [];
  const branchIds: number[] = Array.isArray(body.branchIds) ? body.branchIds.map(Number) : [];
  if (!Number.isInteger(toBranchId)) return json({ error: 'Bad target folder' }, { status: 400 });

  let moved = 0;
  let skipped = 0;
  for (const id of bookmarkIds) {
    try {
      await moveBookmark(uid, id, toBranchId);
      moved++;
    } catch {
      skipped++;
    }
  }
  for (const id of branchIds) {
    try {
      await moveBranch(uid, id, toBranchId); // guards root + cycles
      moved++;
    } catch (e) {
      if (e instanceof MutationError) skipped++;
      else throw e;
    }
  }
  return json({ ok: true, moved, skipped });
};
