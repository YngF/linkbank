import { fail, redirect } from '@sveltejs/kit';
import type { Actions } from './$types';
import { db } from '$lib/server/db/index';
import { hashPassword, createSession, setSessionCookie, needsSetup } from '$lib/server/auth';

export const actions: Actions = {
  default: async ({ request, cookies, url }) => {
    if (!(await needsSetup())) throw redirect(303, '/login');

    const form = await request.formData();
    const username = String(form.get('username') ?? '').trim();
    const password = String(form.get('password') ?? '');
    const confirm = String(form.get('confirm') ?? '');

    if (!username) return fail(400, { error: 'Username is required', username });
    if (password.length < 8) return fail(400, { error: 'Password must be at least 8 characters', username });
    if (password !== confirm) return fail(400, { error: 'Passwords do not match', username });

    const hash = await hashPassword(password);

    // If a seeded, password-less user already owns the data, claim that account
    // (so all existing bookmarks stay owned by it). Otherwise create fresh.
    const existing = await db
      .selectFrom('users')
      .select(['id'])
      .where('password_hash', 'is', null)
      .orderBy('id')
      .executeTakeFirst();

    let userId: number;
    if (existing) {
      await db
        .updateTable('users')
        .set({ username, password_hash: hash, is_admin: 1 })
        .where('id', '=', existing.id)
        .execute();
      userId = existing.id;
    } else {
      const res = await db
        .insertInto('users')
        .values({ username, password_hash: hash, is_admin: 1 })
        .returning('id')
        .executeTakeFirstOrThrow();
      userId = Number(res.id);
      // Fresh install: give the new admin a root folder to hold bookmarks.
      await db
        .insertInto('branches')
        .values({ user_id: userId, parent_id: null, name: username, position: 1 })
        .execute();
    }

    setSessionCookie(cookies, await createSession(userId), url.protocol === 'https:');
    throw redirect(303, '/');
  }
};
