import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listTags } from '$lib/server/tags';

/** GET /api/tags — the user's tags with counts (for autocomplete + sidebar). */
export const GET: RequestHandler = async ({ locals }) => {
  if (locals.userId == null) return json({ error: 'Not signed in' }, { status: 401 });
  return json({ tags: await listTags(locals.userId) });
};
