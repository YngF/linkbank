import { sql } from 'kysely';
import { db } from './db/index';
import { encryptNote } from './notes-crypto';
import { setBookmarkTags } from './tags';
import { isNoteUrl } from '$lib/kind';

/** A bookmark URL is valid if it's a real http(s) link or a note/memo card. */
function validUrl(url: string): boolean {
  return /^https?:\/\//i.test(url) || isNoteUrl(url);
}

/**
 * All write operations, in one place. Every function is scoped to a userId and
 * verifies ownership, so nothing can touch another user's data even before auth
 * lands. This is the layer the API routes are thin wrappers over.
 */

export class MutationError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

function nowIso() {
  // Passed in from callers that need it; SQLite default handles inserts.
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

async function ownBranch(userId: number, branchId: number) {
  const b = await db
    .selectFrom('branches')
    .select(['id', 'parent_id'])
    .where('id', '=', branchId)
    .where('user_id', '=', userId)
    .where('is_deleted', '=', 0)
    .executeTakeFirst();
  if (!b) throw new MutationError(404, 'Folder not found');
  return b;
}

async function ownBookmark(userId: number, id: number) {
  const b = await db
    .selectFrom('bookmarks')
    .select(['id', 'branch_id'])
    .where('id', '=', id)
    .where('user_id', '=', userId)
    .where('is_deleted', '=', 0)
    .executeTakeFirst();
  if (!b) throw new MutationError(404, 'Bookmark not found');
  return b;
}

// ---- bookmarks -------------------------------------------------------------

export async function createBookmark(
  userId: number,
  input: { branchId: number; url: string; title?: string; notes?: string; tags?: string[] }
) {
  const url = (input.url ?? '').trim();
  if (!validUrl(url)) throw new MutationError(400, 'URL must start with http(s):// (or be "note"/"memo")');
  await ownBranch(userId, input.branchId);

  let title = (input.title ?? '').trim();
  if (!title) {
    if (isNoteUrl(url)) {
      title = 'Note';
    } else {
      try {
        title = new URL(url).hostname.replace(/^www\./, '');
      } catch {
        title = url;
      }
    }
  }

  const max = await db
    .selectFrom('bookmarks')
    .select((eb) => eb.fn.max('position').as('m'))
    .where('branch_id', '=', input.branchId)
    .where('user_id', '=', userId)
    .executeTakeFirst();

  const res = await db
    .insertInto('bookmarks')
    .values({
      user_id: userId,
      branch_id: input.branchId,
      title,
      url,
      notes: encryptNote(input.notes?.trim() || null),
      position: (Number(max?.m) || 0) + 1
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  const id = Number(res.id);
  if (input.tags) await setBookmarkTags(userId, id, input.tags);
  return { id };
}

export async function updateBookmark(
  userId: number,
  id: number,
  input: {
    title?: string;
    url?: string;
    notes?: string | null;
    branchId?: number;
    linkIgnore?: boolean;
    tags?: string[];
  }
) {
  await ownBookmark(userId, id);
  const patch: Record<string, unknown> = { updated_at: nowIso() };
  if (input.title !== undefined) {
    const t = input.title.trim();
    if (!t) throw new MutationError(400, 'Title cannot be empty');
    patch.title = t;
  }
  if (input.url !== undefined) {
    const u = input.url.trim();
    if (!validUrl(u)) throw new MutationError(400, 'URL must start with http(s):// (or be "note"/"memo")');
    patch.url = u;
  }
  if (input.notes !== undefined) patch.notes = encryptNote(input.notes?.trim() || null);
  if (input.branchId !== undefined) {
    await ownBranch(userId, input.branchId);
    patch.branch_id = input.branchId;
  }
  if (input.linkIgnore !== undefined) patch.link_ignore = input.linkIgnore ? 1 : 0;
  await db.updateTable('bookmarks').set(patch).where('id', '=', id).where('user_id', '=', userId).execute();
  if (input.tags !== undefined) await setBookmarkTags(userId, id, input.tags);
  return { ok: true };
}

export async function deleteBookmark(userId: number, id: number) {
  await ownBookmark(userId, id);
  await db
    .updateTable('bookmarks')
    .set({ is_deleted: 1, deleted_at: nowIso(), updated_at: nowIso() })
    .where('id', '=', id)
    .where('user_id', '=', userId)
    .execute();
  return { ok: true };
}

/**
 * Move a bookmark into `toBranchId` at `index` (append if index omitted), then
 * renumber that folder's bookmarks 1..N in one transaction. Same-folder drag =
 * a move within the same branch. Positions stay contiguous so ordering is
 * always well-defined.
 */
export async function moveBookmark(
  userId: number,
  id: number,
  toBranchId: number,
  index?: number
) {
  await ownBookmark(userId, id);
  await ownBranch(userId, toBranchId);

  await db.transaction().execute(async (trx) => {
    await trx
      .updateTable('bookmarks')
      .set({ branch_id: toBranchId, updated_at: nowIso() })
      .where('id', '=', id)
      .where('user_id', '=', userId)
      .execute();

    const siblings = await trx
      .selectFrom('bookmarks')
      .select('id')
      .where('user_id', '=', userId)
      .where('branch_id', '=', toBranchId)
      .where('is_deleted', '=', 0)
      .where('id', '!=', id)
      .orderBy('position')
      .execute();

    const ordered = siblings.map((s) => s.id);
    const at = index == null ? ordered.length : Math.max(0, Math.min(index, ordered.length));
    ordered.splice(at, 0, id);

    for (let i = 0; i < ordered.length; i++) {
      await trx
        .updateTable('bookmarks')
        .set({ position: i + 1 })
        .where('id', '=', ordered[i])
        .execute();
    }
  });
  return { ok: true };
}

/**
 * Duplicate a bookmark into `toBranchId` (append), copying its tags. Notes are
 * copied as-is (they're already encrypted at rest), so no re-encryption needed.
 */
export async function copyBookmark(userId: number, id: number, toBranchId: number) {
  const src = await db
    .selectFrom('bookmarks')
    .select(['title', 'url', 'notes'])
    .where('id', '=', id)
    .where('user_id', '=', userId)
    .where('is_deleted', '=', 0)
    .executeTakeFirst();
  if (!src) throw new MutationError(404, 'Bookmark not found');
  await ownBranch(userId, toBranchId);

  const max = await db
    .selectFrom('bookmarks')
    .select((eb) => eb.fn.max('position').as('m'))
    .where('branch_id', '=', toBranchId)
    .where('user_id', '=', userId)
    .executeTakeFirst();

  const res = await db
    .insertInto('bookmarks')
    .values({
      user_id: userId,
      branch_id: toBranchId,
      title: src.title,
      url: src.url,
      notes: src.notes, // already encrypted
      position: (Number(max?.m) || 0) + 1
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  const newId = Number(res.id);

  const tags = await db.selectFrom('bookmark_tags').select('tag_id').where('bookmark_id', '=', id).execute();
  if (tags.length) {
    await db.insertInto('bookmark_tags').values(tags.map((t) => ({ bookmark_id: newId, tag_id: t.tag_id }))).execute();
  }
  return { id: newId };
}

/** All descendant branch ids of `rootId` (for the move cycle-guard). */
async function descendantIds(userId: number, rootId: number): Promise<Set<number>> {
  const all = await db
    .selectFrom('branches')
    .select(['id', 'parent_id'])
    .where('user_id', '=', userId)
    .where('is_deleted', '=', 0)
    .execute();
  const kids = new Map<number, number[]>();
  for (const b of all) {
    if (b.parent_id == null) continue;
    if (!kids.has(b.parent_id)) kids.set(b.parent_id, []);
    kids.get(b.parent_id)!.push(b.id);
  }
  const out = new Set<number>();
  const stack = [rootId];
  while (stack.length) {
    const n = stack.pop()!;
    for (const c of kids.get(n) ?? []) {
      if (!out.has(c)) {
        out.add(c);
        stack.push(c);
      }
    }
  }
  return out;
}

/**
 * Move a folder under `toParentId` at `index`, renumbering that parent's
 * children. Rejects moving the root, and moving a folder into itself or any of
 * its own descendants (which would orphan a subtree).
 */
export async function moveBranch(
  userId: number,
  id: number,
  toParentId: number,
  index?: number
) {
  const b = await ownBranch(userId, id);
  if (b.parent_id === null) throw new MutationError(400, 'The root folder cannot be moved');
  await ownBranch(userId, toParentId);

  if (toParentId === id) throw new MutationError(400, 'Cannot move a folder into itself');
  const descendants = await descendantIds(userId, id);
  if (descendants.has(toParentId))
    throw new MutationError(400, 'Cannot move a folder into one of its own subfolders');

  await db.transaction().execute(async (trx) => {
    await trx
      .updateTable('branches')
      .set({ parent_id: toParentId, updated_at: nowIso() })
      .where('id', '=', id)
      .where('user_id', '=', userId)
      .execute();

    const siblings = await trx
      .selectFrom('branches')
      .select('id')
      .where('user_id', '=', userId)
      .where('parent_id', '=', toParentId)
      .where('is_deleted', '=', 0)
      .where('id', '!=', id)
      .orderBy('position')
      .execute();

    const ordered = siblings.map((s) => s.id);
    const at = index == null ? ordered.length : Math.max(0, Math.min(index, ordered.length));
    ordered.splice(at, 0, id);

    for (let i = 0; i < ordered.length; i++) {
      await trx
        .updateTable('branches')
        .set({ position: i + 1 })
        .where('id', '=', ordered[i])
        .execute();
    }
  });
  return { ok: true };
}

// ---- folders ---------------------------------------------------------------

export async function createBranch(userId: number, input: { parentId: number; name: string }) {
  const name = (input.name ?? '').trim();
  if (!name) throw new MutationError(400, 'Folder name cannot be empty');
  await ownBranch(userId, input.parentId);

  const max = await db
    .selectFrom('branches')
    .select((eb) => eb.fn.max('position').as('m'))
    .where('parent_id', '=', input.parentId)
    .where('user_id', '=', userId)
    .executeTakeFirst();

  const res = await db
    .insertInto('branches')
    .values({
      user_id: userId,
      parent_id: input.parentId,
      name,
      position: (Number(max?.m) || 0) + 1
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  return { id: Number(res.id) };
}

export async function renameBranch(userId: number, id: number, name: string) {
  const n = (name ?? '').trim();
  if (!n) throw new MutationError(400, 'Folder name cannot be empty');
  const b = await ownBranch(userId, id);
  if (b.parent_id === null) throw new MutationError(400, 'The root folder cannot be renamed here');
  await db
    .updateTable('branches')
    .set({ name: n, updated_at: nowIso() })
    .where('id', '=', id)
    .where('user_id', '=', userId)
    .execute();
  return { ok: true };
}

export async function deleteBranch(userId: number, id: number) {
  const b = await ownBranch(userId, id);
  if (b.parent_id === null) throw new MutationError(400, 'The root folder cannot be deleted');

  const kids = await db
    .selectFrom('branches')
    .select('id')
    .where('parent_id', '=', id)
    .where('user_id', '=', userId)
    .where('is_deleted', '=', 0)
    .executeTakeFirst();
  const links = await db
    .selectFrom('bookmarks')
    .select('id')
    .where('branch_id', '=', id)
    .where('user_id', '=', userId)
    .where('is_deleted', '=', 0)
    .executeTakeFirst();
  if (kids || links)
    throw new MutationError(
      409,
      'Folder is not empty. Move or delete its bookmarks and subfolders first.'
    );

  await db
    .updateTable('branches')
    .set({ is_deleted: 1, deleted_at: nowIso(), updated_at: nowIso() })
    .where('id', '=', id)
    .where('user_id', '=', userId)
    .execute();
  return { ok: true };
}

// ---- trash: restore, purge, empty ------------------------------------------

/** Restore a trashed bookmark. If its folder is gone/trashed, move it to root. */
export async function restoreBookmark(userId: number, id: number) {
  const bm = await db
    .selectFrom('bookmarks')
    .select(['id', 'branch_id'])
    .where('id', '=', id)
    .where('user_id', '=', userId)
    .where('is_deleted', '=', 1)
    .executeTakeFirst();
  if (!bm) throw new MutationError(404, 'Not in trash');

  const branch = await db
    .selectFrom('branches')
    .select('id')
    .where('id', '=', bm.branch_id)
    .where('user_id', '=', userId)
    .where('is_deleted', '=', 0)
    .executeTakeFirst();

  let branchId = bm.branch_id;
  if (!branch) {
    const root = await db
      .selectFrom('branches')
      .select('id')
      .where('user_id', '=', userId)
      .where('parent_id', 'is', null)
      .where('is_deleted', '=', 0)
      .executeTakeFirstOrThrow();
    branchId = root.id;
  }

  await db
    .updateTable('bookmarks')
    .set({ is_deleted: 0, deleted_at: null, branch_id: branchId, updated_at: nowIso() })
    .where('id', '=', id)
    .where('user_id', '=', userId)
    .execute();
  return { ok: true, movedToRoot: !branch };
}

/** Restore a trashed folder. If its parent is gone/trashed, move it to root. */
export async function restoreBranch(userId: number, id: number) {
  const br = await db
    .selectFrom('branches')
    .select(['id', 'parent_id'])
    .where('id', '=', id)
    .where('user_id', '=', userId)
    .where('is_deleted', '=', 1)
    .executeTakeFirst();
  if (!br) throw new MutationError(404, 'Not in trash');

  let parentId = br.parent_id;
  if (parentId != null) {
    const parent = await db
      .selectFrom('branches')
      .select('id')
      .where('id', '=', parentId)
      .where('user_id', '=', userId)
      .where('is_deleted', '=', 0)
      .executeTakeFirst();
    if (!parent) {
      const root = await db
        .selectFrom('branches')
        .select('id')
        .where('user_id', '=', userId)
        .where('parent_id', 'is', null)
        .where('is_deleted', '=', 0)
        .executeTakeFirstOrThrow();
      parentId = root.id;
    }
  }

  await db
    .updateTable('branches')
    .set({ is_deleted: 0, deleted_at: null, parent_id: parentId, updated_at: nowIso() })
    .where('id', '=', id)
    .where('user_id', '=', userId)
    .execute();
  return { ok: true };
}

/** Permanently remove a single trashed item. */
export async function purgeBookmark(userId: number, id: number) {
  await db.deleteFrom('bookmarks').where('id', '=', id).where('user_id', '=', userId).where('is_deleted', '=', 1).execute();
  return { ok: true };
}
export async function purgeBranch(userId: number, id: number) {
  await db.deleteFrom('branches').where('id', '=', id).where('user_id', '=', userId).where('is_deleted', '=', 1).execute();
  return { ok: true };
}

/** Permanently remove everything in this user's trash. */
export async function emptyTrash(userId: number) {
  await db.transaction().execute(async (trx) => {
    await trx.deleteFrom('bookmarks').where('user_id', '=', userId).where('is_deleted', '=', 1).execute();
    await trx.deleteFrom('branches').where('user_id', '=', userId).where('is_deleted', '=', 1).execute();
  });
  return { ok: true };
}
