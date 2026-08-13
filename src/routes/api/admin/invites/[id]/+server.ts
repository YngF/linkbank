import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { revokeInvite } from '$lib/server/admin';

// DELETE /api/admin/invites/[id] — revoke a pending invite.
export const DELETE: RequestHandler = async ({ params, locals }) => {
  if (locals.user?.is_admin !== 1) return json({ error: 'Admins only' }, { status: 403 });
  await revokeInvite(Number(params.id));
  return json({ ok: true });
};
