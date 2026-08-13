import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { listUsers, listInvites } from '$lib/server/admin';

export const load: PageServerLoad = async ({ locals }) => {
  if (locals.user?.is_admin !== 1) throw redirect(303, '/');
  return {
    users: await listUsers(),
    invites: await listInvites(),
    selfId: locals.user.id
  };
};
