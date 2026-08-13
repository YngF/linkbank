import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getValidInvite, consumeInvite } from '$lib/server/admin';

export const load: PageServerLoad = async ({ params }) => {
  const invite = await getValidInvite(params.token);
  return {
    valid: !!invite,
    email: invite?.email ?? null,
    isAdmin: invite?.is_admin === 1
  };
};

export const actions: Actions = {
  default: async ({ request, params, cookies, url }) => {
    const form = await request.formData();
    const username = String(form.get('username') ?? '');
    const password = String(form.get('password') ?? '');
    const confirm = String(form.get('confirm') ?? '');
    if (password !== confirm) return fail(400, { error: 'Passwords do not match', username });

    const r = await consumeInvite(params.token, username, password, cookies, url.protocol === 'https:');
    if (!r.ok) return fail(400, { error: r.error, username });
    throw redirect(303, '/');
  }
};
