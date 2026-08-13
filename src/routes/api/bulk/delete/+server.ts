import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { deleteBookmark, deleteBranch, MutationError } from '$lib/server/mutations';

// POST /api/bulk/delete { bookmarkIds, branchIds }
// Bookmarks are always trashed; folders only if empty (others are reported).
// Returns the ids actually deleted so the client can offer a single Undo.
export const POST: RequestHandler = async ({ request, locals }) => {
  const uid = locals.userId;
  if (uid == null) return json({ error: 'Not signed in' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const bookmarkIds: number[] = Array.isArray(body.bookmarkIds) ? body.bookmarkIds.map(Number) : [];
  const branchIds: number[] = Array.isArray(body.branchIds) ? body.branchIds.map(Number) : [];

  const deletedBookmarks: number[] = [];
  const deletedBranches: number[] = [];
  let skippedFolders = 0;

  for (const id of bookmarkIds) {
    try {
      await deleteBookmark(uid, id);
      deletedBookmarks.push(id);
    } catch {
      /* skip */
    }
  }
  for (const id of branchIds) {
    try {
      await deleteBranch(uid, id); // throws 409 if not empty
      deletedBranches.push(id);
    } catch (e) {
      if (e instanceof MutationError) skippedFolders++;
      else throw e;
    }
  }
  return json({ ok: true, deletedBookmarks, deletedBranches, skippedFolders });
};
