import { fail, redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db/index';
import { verifyPassword, createSession, setSessionCookie } from '$lib/server/auth';

export const load: PageServerLoad = async () => {
  // Surface whether self-registration is offered.
  const mode = (env.REGISTRATION ?? 'closed').toLowerCase();
  return { registrationOpen: mode === 'open' || mode === 'invite' };
};

export const actions: Actions = {
  default: async ({ request, cookies, url }) => {
    const form = await request.formData();
    const username = String(form.get('username') ?? '').trim();
    const password = String(form.get('password') ?? '');
    if (!username || !password) return fail(400, { error: 'Enter your username and password', username });

    const user = await db
      .selectFrom('users')
      .select(['id', 'password_hash'])
      .where('username', '=', username)
      .executeTakeFirst();

    // Always run a verify to keep timing uniform whether or not the user exists.
    const ok =
      user?.password_hash != null && (await verifyPassword(password, user.password_hash));
    if (!ok) return fail(400, { error: 'Incorrect username or password', username });

    setSessionCookie(cookies, await createSession(user!.id), url.protocol === 'https:');
    throw redirect(303, '/');
  }
};
