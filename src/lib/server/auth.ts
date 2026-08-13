import { scrypt, randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { sql } from 'kysely';
import type { Cookies } from '@sveltejs/kit';
import { db } from './db/index';

const scryptAsync = promisify(scrypt);

const SESSION_COOKIE = 'session';
const SESSION_DAYS = 30;

// ---- passwords (Node's built-in scrypt — no dependency) --------------------

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = (await scryptAsync(password, salt, 64)) as Buffer;
  return `scrypt:${salt.toString('hex')}:${key.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const salt = Buffer.from(parts[1], 'hex');
  const expected = Buffer.from(parts[2], 'hex');
  const test = (await scryptAsync(password, salt, 64)) as Buffer;
  return expected.length === test.length && timingSafeEqual(expected, test);
}

// ---- sessions --------------------------------------------------------------

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export interface SessionUser {
  id: number;
  username: string;
  is_admin: number;
}

/** Create a session, return the raw token to put in the cookie. */
export async function createSession(userId: number): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5);
  await db
    .insertInto('sessions')
    .values({ id: sha256(token), user_id: userId, expires_at: expires.toISOString() })
    .execute();
  return token;
}

/** Validate a cookie token; returns the user or null. Slides the expiry. */
export async function validateSession(token: string): Promise<SessionUser | null> {
  const id = sha256(token);
  const row = await db
    .selectFrom('sessions')
    .innerJoin('users', 'users.id', 'sessions.user_id')
    .select(['sessions.expires_at as expires_at', 'users.id as id', 'users.username as username', 'users.is_admin as is_admin'])
    .where('sessions.id', '=', id)
    .executeTakeFirst();
  if (!row) return null;

  if (new Date(row.expires_at).getTime() < Date.now()) {
    await db.deleteFrom('sessions').where('id', '=', id).execute();
    return null;
  }
  // sliding window: if <half the lifetime remains, extend it
  const remaining = new Date(row.expires_at).getTime() - Date.now();
  if (remaining < (SESSION_DAYS / 2) * 864e5) {
    await db
      .updateTable('sessions')
      .set({ expires_at: new Date(Date.now() + SESSION_DAYS * 864e5).toISOString() })
      .where('id', '=', id)
      .execute();
  }
  return { id: row.id, username: row.username, is_admin: row.is_admin };
}

export async function deleteSession(token: string): Promise<void> {
  await db.deleteFrom('sessions').where('id', '=', sha256(token)).execute();
}

// ---- cookie helpers --------------------------------------------------------

export function setSessionCookie(cookies: Cookies, token: string, secure: boolean) {
  // `secure` MUST reflect the real connection: SvelteKit otherwise defaults it
  // to true for any non-localhost host, which drops the cookie when you access
  // a dev server over http on a LAN IP (…and then login loops). Pass
  // url.protocol === 'https:' — true in production behind a TLS proxy (with
  // PROTOCOL_HEADER=x-forwarded-proto set), false for plain-http dev.
  cookies.set(SESSION_COOKIE, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure,
    maxAge: SESSION_DAYS * 864e2
  });
}

export function clearSessionCookie(cookies: Cookies) {
  cookies.delete(SESSION_COOKIE, { path: '/' });
}

export const sessionCookieName = SESSION_COOKIE;

// ---- account helpers -------------------------------------------------------

/** True when no admin account has a password yet — triggers first-run setup. */
export async function needsSetup(): Promise<boolean> {
  const row = await db
    .selectFrom('users')
    .select('id')
    .where('password_hash', 'is not', null)
    .executeTakeFirst();
  return !row;
}

/** sha256 hex — exported for hashing invite tokens the same way as sessions. */
export const hashToken = sha256;

// ---- API tokens (browser extension / ingest) -------------------------------

const tokenNow = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

export async function createApiToken(userId: number, name: string): Promise<string> {
  const token = 'lb_' + randomBytes(24).toString('base64url');
  await db
    .insertInto('api_tokens')
    .values({ user_id: userId, name: name.trim() || 'Token', token_hash: sha256(token) })
    .execute();
  return token;
}

/** Resolve a raw bearer token to a user id, updating last-used. Null if invalid. */
export async function userIdFromToken(token: string | null | undefined): Promise<number | null> {
  if (!token) return null;
  const row = await db.selectFrom('api_tokens').select(['id', 'user_id']).where('token_hash', '=', sha256(token)).executeTakeFirst();
  if (!row) return null;
  await db.updateTable('api_tokens').set({ last_used_at: tokenNow() }).where('id', '=', row.id).execute();
  return row.user_id;
}

export async function listApiTokens(userId: number) {
  return db
    .selectFrom('api_tokens')
    .select(['id', 'name', 'created_at', 'last_used_at'])
    .where('user_id', '=', userId)
    .orderBy('created_at', 'desc')
    .execute();
}

export async function revokeApiToken(userId: number, id: number): Promise<void> {
  await db.deleteFrom('api_tokens').where('id', '=', id).where('user_id', '=', userId).execute();
}

// ---- self-service account --------------------------------------------------

export async function getAccount(userId: number): Promise<{ username: string; email: string | null } | null> {
  const u = await db
    .selectFrom('users')
    .select(['username', 'email'])
    .where('id', '=', userId)
    .executeTakeFirst();
  return u ?? null;
}

/** Update the current user's email (null/empty clears it). */
export async function setEmail(userId: number, email: string | null): Promise<{ ok: boolean; error?: string }> {
  const e = email?.trim() || null;
  if (e && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return { ok: false, error: 'That doesn’t look like an email address' };
  if (e) {
    const clash = await db
      .selectFrom('users')
      .select('id')
      .where('id', '!=', userId)
      .where(sql`lower(email)`, '=', e.toLowerCase())
      .executeTakeFirst();
    if (clash) return { ok: false, error: 'That email is already in use' };
  }
  await db.updateTable('users').set({ email: e }).where('id', '=', userId).execute();
  return { ok: true };
}

/** Change the current user's password after verifying the current one. */
export async function changePassword(
  userId: number,
  currentPassword: string,
  newPassword: string
): Promise<{ ok: boolean; error?: string }> {
  if (newPassword.length < 8) return { ok: false, error: 'New password must be at least 8 characters' };
  const u = await db.selectFrom('users').select('password_hash').where('id', '=', userId).executeTakeFirst();
  if (!u?.password_hash) return { ok: false, error: 'No password set for this account' };
  if (!(await verifyPassword(currentPassword, u.password_hash)))
    return { ok: false, error: 'Current password is incorrect' };
  await db.updateTable('users').set({ password_hash: await hashPassword(newPassword) }).where('id', '=', userId).execute();
  return { ok: true };
}
