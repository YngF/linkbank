import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createApiToken } from '$lib/server/auth';

// POST /api/account/tokens { name } — create a personal access token (shown once).
export const POST: RequestHandler = async ({ request, locals }) => {
  if (locals.userId == null) return json({ error: 'Not signed in' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const token = await createApiToken(locals.userId, String(body.name ?? 'Token'));
  return json({ ok: true, token });
};
