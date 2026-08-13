import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { linkProgress } from '$lib/server/linkcheck';

/** GET /api/links/status — current sweep progress (for polling). */
export const GET: RequestHandler = async ({ locals }) => {
  if (locals.userId == null) return json({ error: 'Not signed in' }, { status: 401 });
  return json(linkProgress());
};
