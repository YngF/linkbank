import { sql } from 'kysely';
import { db } from './db/index';
import { createBookmark } from './mutations';

/**
 * Saving a shared/extension-captured link. Everything funnels through here so
 * the PWA share target and the browser extension behave identically: the link
 * lands in the user's "Inbox" folder (created on first use).
 */

const INBOX_NAME = 'Inbox';

/** Find (or create) the user's Inbox folder, directly under their root. */
export async function inboxBranchId(userId: number): Promise<number> {
  const root = await db
    .selectFrom('branches')
    .select('id')
    .where('user_id', '=', userId)
    .where('parent_id', 'is', null)
    .where('is_deleted', '=', 0)
    .executeTakeFirstOrThrow();

  const existing = await db
    .selectFrom('branches')
    .select('id')
    .where('user_id', '=', userId)
    .where('parent_id', '=', root.id)
    .where('is_deleted', '=', 0)
    .where(sql`lower(name)`, '=', INBOX_NAME.toLowerCase())
    .executeTakeFirst();
  if (existing) return existing.id;

  const res = await db
    .insertInto('branches')
    .values({ user_id: userId, parent_id: root.id, name: INBOX_NAME, position: 0 })
    .returning('id')
    .executeTakeFirstOrThrow();
  return Number(res.id);
}

/** Pull the first http(s) URL out of arbitrary shared text. */
export function urlFromText(text: string | null | undefined): string | null {
  if (!text) return null;
  const m = text.match(/https?:\/\/[^\s]+/i);
  return m ? m[0] : null;
}

export interface IngestInput {
  url?: string | null;
  title?: string | null;
  text?: string | null;
  notes?: string | null;
  tags?: string[];
}

/** Save a link to the user's Inbox. Returns the new bookmark id + folder. */
export async function saveToInbox(
  userId: number,
  input: IngestInput
): Promise<{ id: number; folder: string; url: string }> {
  const url = (input.url && /^https?:\/\//i.test(input.url) ? input.url : urlFromText(input.text) || urlFromText(input.title))?.trim();
  if (!url) throw new Error('No link found to save');

  const branchId = await inboxBranchId(userId);
  const { id } = await createBookmark(userId, {
    branchId,
    url,
    title: input.title ?? undefined,
    notes: input.notes ?? undefined,
    tags: input.tags
  });
  return { id, folder: INBOX_NAME, url };
}
