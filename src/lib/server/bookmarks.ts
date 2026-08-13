import { db } from './db/index';
import { decryptNote } from './notes-crypto';
import { tagsForBookmarks } from './tags';
import type { BookmarkWithTags } from './db/types';

/**
 * List a folder's bookmarks for its owner, with notes decrypted for display and
 * each bookmark's tags attached. The single place folder reads happen, so
 * encryption and tag-enrichment stay transparent to the UI.
 */
export async function listBookmarks(userId: number, branchId: number): Promise<BookmarkWithTags[]> {
  const rows = await db
    .selectFrom('bookmarks')
    .selectAll()
    .where('user_id', '=', userId)
    .where('branch_id', '=', branchId)
    .where('is_deleted', '=', 0)
    .orderBy('position')
    .execute();

  const tagMap = await tagsForBookmarks(userId, rows.map((r) => r.id));
  return rows.map((r) => ({ ...r, notes: decryptNote(r.notes), tags: tagMap.get(r.id) ?? [] }));
}
