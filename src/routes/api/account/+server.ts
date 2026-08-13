import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { setEmail, changePassword } from '$lib/server/auth';

// PATCH /api/account { email?, currentPassword?, newPassword? }
// Self-service: the signed-in user updates their own email and/or password.
export const PATCH: RequestHandler = async ({ request, locals }) => {
  const userId = locals.userId;
  if (userId == null) return json({ error: 'Not signed in' }, { status: 401 });
  const body = await request.json().catch(() => ({}));

  if (body.email !== undefined) {
    const r = await setEmail(userId, body.email);
    if (!r.ok) return json({ error: r.error }, { status: 400 });
  }
  if (body.newPassword) {
    const r = await changePassword(userId, String(body.currentPassword ?? ''), String(body.newPassword));
    if (!r.ok) return json({ error: r.error }, { status: 400 });
  }
  return json({ ok: true });
};
