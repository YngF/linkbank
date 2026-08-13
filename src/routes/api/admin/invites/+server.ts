import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createInvite } from '$lib/server/admin';

// POST /api/admin/invites { email?, note?, isAdmin?, expiresInDays? }
// Returns the one-time invite link (the raw token is never stored or shown again).
export const POST: RequestHandler = async ({ request, locals, url }) => {
  if (locals.user?.is_admin !== 1) return json({ error: 'Admins only' }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const { token, id } = await createInvite(locals.user.id, {
    email: body.email,
    note: body.note,
    isAdmin: !!body.isAdmin,
    expiresInDays: body.expiresInDays != null ? Number(body.expiresInDays) : undefined
  });
  const link = `${url.origin}/invite/${token}`;
  return json({ ok: true, id, link });
};
