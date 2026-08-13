import { fail, redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db/index';
import { hashPassword, createSession, setSessionCookie } from '$lib/server/auth';

function mode() {
  return (env.REGISTRATION ?? 'closed').toLowerCase();
}

export const load: PageServerLoad = async () => {
  const m = mode();
  return { open: m === 'open' || m === 'invite', needsInvite: m === 'invite' };
};

export const actions: Actions = {
  default: async ({ request, cookies, url }) => {
    const m = mode();
    if (m !== 'open' && m !== 'invite') return fail(403, { error: 'Registration is closed on this instance.' });

    const form = await request.formData();
    const username = String(form.get('username') ?? '').trim();
    const password = String(form.get('password') ?? '');
    const confirm = String(form.get('confirm') ?? '');
    const invite = String(form.get('invite') ?? '');

    if (m === 'invite' && invite !== (env.INVITE_CODE ?? ''))
      return fail(400, { error: 'Invalid invite code', username });
    if (!username) return fail(400, { error: 'Username is required', username });
    if (password.length < 8) return fail(400, { error: 'Password must be at least 8 characters', username });
    if (password !== confirm) return fail(400, { error: 'Passwords do not match', username });

    const existing = await db
      .selectFrom('users')
      .select(['id', 'password_hash'])
      .where('username', '=', username)
      .executeTakeFirst();

    const hash = await hashPassword(password);
    let userId: number;

    if (existing && existing.password_hash != null) {
      // Fully-registered account with that name.
      return fail(400, { error: 'That username is taken', username });
    } else if (existing) {
      // A pre-created, password-less account (e.g. imported by an admin):
      // claim it — set the password, keep its role and all imported data.
      await db
        .updateTable('users')
        .set({ password_hash: hash })
        .where('id', '=', existing.id)
        .execute();
      userId = existing.id;
    } else {
      // Brand-new account: create it with a root folder to hold bookmarks.
      const res = await db
        .insertInto('users')
        .values({ username, password_hash: hash, is_admin: 0 })
        .returning('id')
        .executeTakeFirstOrThrow();
      userId = Number(res.id);
      await db
        .insertInto('branches')
        .values({ user_id: userId, parent_id: null, name: username, position: 1 })
        .execute();
    }

    setSessionCookie(cookies, await createSession(userId), url.protocol === 'https:');
    throw redirect(303, '/');
  }
};
