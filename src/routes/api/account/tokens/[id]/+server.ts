import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { revokeApiToken } from '$lib/server/auth';

// DELETE /api/account/tokens/[id] — revoke one of your tokens.
export const DELETE: RequestHandler = async ({ params, locals }) => {
  if (locals.userId == null) return json({ error: 'Not signed in' }, { status: 401 });
  await revokeApiToken(locals.userId, Number(params.id));
  return json({ ok: true });
};
