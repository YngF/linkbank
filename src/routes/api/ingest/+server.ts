import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { userIdFromToken } from '$lib/server/auth';
import { saveToInbox } from '$lib/server/ingest';

// CORS so the browser extension can call this cross-origin. Safe with `*`
// because auth is via a bearer token (not cookies) — no credentials are used.
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type',
  'access-control-max-age': '86400'
};

export const OPTIONS: RequestHandler = async () => new Response(null, { status: 204, headers: CORS });

/**
 * POST /api/ingest — save a link to the user's Inbox.
 * Auth: `Authorization: Bearer <token>` (extension) OR the session cookie.
 * Body: { url, title?, text?, notes?, tags? }
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  const auth = request.headers.get('authorization');
  let userId: number | null = locals.userId;
  if (auth?.toLowerCase().startsWith('bearer ')) userId = await userIdFromToken(auth.slice(7).trim());
  if (userId == null) return json({ error: 'Unauthorized' }, { status: 401, headers: CORS });

  const body = await request.json().catch(() => ({}));
  try {
    const r = await saveToInbox(userId, {
      url: body.url,
      title: body.title,
      text: body.text,
      notes: body.notes,
      tags: Array.isArray(body.tags) ? body.tags.map(String) : undefined
    });
    return json({ ok: true, ...r }, { headers: CORS });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Failed to save' }, { status: 400, headers: CORS });
  }
};
