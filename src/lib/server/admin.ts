import { sql } from 'kysely';
import { randomBytes } from 'node:crypto';
import type { Cookies } from '@sveltejs/kit';
import { db } from './db/index';
import { hashPassword, hashToken, createSession, setSessionCookie } from './auth';

/**
 * Admin operations: user management + invite links. Every mutation takes the
 * acting admin's id so it can enforce the safety rails (never remove the last
 * admin, never delete a user who still owns data, never delete yourself).
 */

export interface AdminUser {
  id: number;
  username: string;
  email: string | null;
  is_admin: number;
  created_at: string;
  bookmarks: number;
  folders: number; // sub-folders (excludes the root)
  sessions: number;
}

export async function listUsers(): Promise<AdminUser[]> {
  const users = await db.selectFrom('users').select(['id', 'username', 'email', 'is_admin', 'created_at']).execute();
  const out: AdminUser[] = [];
  for (const u of users) {
    const bm = await db.selectFrom('bookmarks').select(sql<number>`count(*)`.as('c')).where('user_id', '=', u.id).where('is_deleted', '=', 0).executeTakeFirst();
    const fo = await db.selectFrom('branches').select(sql<number>`count(*)`.as('c')).where('user_id', '=', u.id).where('is_deleted', '=', 0).where('parent_id', 'is not', null).executeTakeFirst();
    const se = await db.selectFrom('sessions').select(sql<number>`count(*)`.as('c')).where('user_id', '=', u.id).executeTakeFirst();
    out.push({
      id: u.id,
      username: u.username,
      email: u.email,
      is_admin: u.is_admin,
      created_at: u.created_at,
      bookmarks: Number(bm?.c ?? 0),
      folders: Number(fo?.c ?? 0),
      sessions: Number(se?.c ?? 0)
    });
  }
  return out.sort((a, b) => a.username.localeCompare(b.username));
}

export async function adminCount(): Promise<number> {
  const r = await db.selectFrom('users').select(sql<number>`count(*)`.as('c')).where('is_admin', '=', 1).executeTakeFirst();
  return Number(r?.c ?? 0);
}

export async function setAdmin(targetId: number, makeAdmin: boolean): Promise<{ ok: boolean; error?: string }> {
  if (!makeAdmin) {
    const target = await db.selectFrom('users').select('is_admin').where('id', '=', targetId).executeTakeFirst();
    if (target?.is_admin === 1 && (await adminCount()) <= 1)
      return { ok: false, error: 'Cannot remove the last administrator' };
  }
  await db.updateTable('users').set({ is_admin: makeAdmin ? 1 : 0 }).where('id', '=', targetId).execute();
  return { ok: true };
}

/** Delete a user — refused unless they own nothing (block-unless-empty). */
export async function deleteUser(actingUserId: number, targetId: number): Promise<{ ok: boolean; error?: string }> {
  if (targetId === actingUserId) return { ok: false, error: 'You can’t delete your own account here' };
  const target = await db.selectFrom('users').select(['id', 'is_admin']).where('id', '=', targetId).executeTakeFirst();
  if (!target) return { ok: false, error: 'User not found' };
  if (target.is_admin === 1 && (await adminCount()) <= 1)
    return { ok: false, error: 'Cannot delete the last administrator' };

  // "Empty" means no bookmarks and no sub-folders at all — including trashed
  // ones, which still reference the user and would block the delete.
  const bm = await db.selectFrom('bookmarks').select('id').where('user_id', '=', targetId).executeTakeFirst();
  const sub = await db.selectFrom('branches').select('id').where('user_id', '=', targetId).where('parent_id', 'is not', null).executeTakeFirst();
  if (bm || sub)
    return {
      ok: false,
      error: 'This user still owns bookmarks or folders (check their Trash too). Ask them to clear those first.'
    };

  // Empty user: only their root folder + sessions + any invites they created remain.
  await db.transaction().execute(async (trx) => {
    await trx.deleteFrom('sessions').where('user_id', '=', targetId).execute();
    await trx.deleteFrom('invites').where('created_by', '=', targetId).execute();
    await trx.updateTable('invites').set({ used_by: null }).where('used_by', '=', targetId).execute();
    await trx.deleteFrom('branches').where('user_id', '=', targetId).execute();
    await trx.deleteFrom('users').where('id', '=', targetId).execute();
  });
  return { ok: true };
}

// ---- invites ---------------------------------------------------------------

export interface InviteRow {
  id: number;
  email: string | null;
  note: string | null;
  is_admin: number;
  expires_at: string | null;
  used_at: string | null;
  used_by_username: string | null;
  created_at: string;
}

function nowIso() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

/** Create an invite; returns the raw token (only shown once, in the link). */
export async function createInvite(
  createdBy: number,
  opts: { email?: string; note?: string; isAdmin?: boolean; expiresInDays?: number }
): Promise<{ token: string; id: number }> {
  const token = randomBytes(24).toString('base64url');
  const expires =
    opts.expiresInDays && opts.expiresInDays > 0
      ? new Date(Date.now() + opts.expiresInDays * 864e5).toISOString().replace('T', ' ').slice(0, 19)
      : null;
  const res = await db
    .insertInto('invites')
    .values({
      token_hash: hashToken(token),
      created_by: createdBy,
      email: opts.email?.trim() || null,
      note: opts.note?.trim() || null,
      is_admin: opts.isAdmin ? 1 : 0,
      expires_at: expires,
      created_at: nowIso()
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  return { token, id: Number(res.id) };
}

export async function listInvites(): Promise<InviteRow[]> {
  const rows = await db
    .selectFrom('invites')
    .leftJoin('users', 'users.id', 'invites.used_by')
    .select([
      'invites.id as id', 'invites.email as email', 'invites.note as note', 'invites.is_admin as is_admin',
      'invites.expires_at as expires_at', 'invites.used_at as used_at', 'invites.created_at as created_at',
      'users.username as used_by_username'
    ])
    .execute();
  return rows.sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));
}

export async function revokeInvite(id: number): Promise<void> {
  await db.deleteFrom('invites').where('id', '=', id).where('used_at', 'is', null).execute();
}

/** Look up a still-valid invite by its raw token. */
export async function getValidInvite(token: string) {
  const row = await db
    .selectFrom('invites')
    .select(['id', 'email', 'is_admin', 'expires_at', 'used_at'])
    .where('token_hash', '=', hashToken(token))
    .executeTakeFirst();
  if (!row) return null;
  if (row.used_at) return null;
  if (row.expires_at && new Date(row.expires_at.replace(' ', 'T') + 'Z').getTime() < Date.now()) return null;
  return row;
}

/** Redeem an invite: create the account, mark it used, and sign the user in. */
export async function consumeInvite(
  token: string,
  username: string,
  password: string,
  cookies: Cookies,
  secure: boolean
): Promise<{ ok: boolean; error?: string }> {
  const invite = await getValidInvite(token);
  if (!invite) return { ok: false, error: 'This invite is invalid, already used, or expired.' };

  const uname = username.trim();
  if (!uname) return { ok: false, error: 'Username is required' };
  if (password.length < 8) return { ok: false, error: 'Password must be at least 8 characters' };

  const taken = await db.selectFrom('users').select('id').where('username', '=', uname).executeTakeFirst();
  if (taken) return { ok: false, error: 'That username is taken' };

  const hash = await hashPassword(password);
  const userId = await db.transaction().execute(async (trx) => {
    const res = await trx
      .insertInto('users')
      .values({ username: uname, email: invite.email, password_hash: hash, is_admin: invite.is_admin })
      .returning('id')
      .executeTakeFirstOrThrow();
    const id = Number(res.id);
    await trx.insertInto('branches').values({ user_id: id, parent_id: null, name: uname, position: 1 }).execute();
    await trx.updateTable('invites').set({ used_at: nowIso(), used_by: id }).where('id', '=', invite.id).execute();
    return id;
  });

  setSessionCookie(cookies, await createSession(userId), secure);
  return { ok: true };
}
