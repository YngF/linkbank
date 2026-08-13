import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { runSweep, checkBookmark, linkProgress } from '$lib/server/linkcheck';

/**
 * POST /api/links/check
 *   body {}          — start a full sweep of the user's bookmarks (background;
 *                      poll /api/links/status for progress).
 *   body { id }      — re-check a single bookmark and return its result.
 */
export const POST: RequestHandler = async ({ locals, request }) => {
  const userId = locals.userId;
  if (userId == null) return json({ error: 'Not signed in' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const id = Number(body?.id);

  if (Number.isFinite(id) && id > 0) {
    const res = await checkBookmark(userId, id);
    if (!res) return json({ error: 'Not found' }, { status: 404 });
    return json(res);
  }

  const p = linkProgress();
  if (p.running) return json({ started: false, ...p });

  // Fire-and-forget: the sweep runs in the background, UI polls status.
  runSweep({ userId }).catch((e) => console.error('[linkcheck] manual sweep:', e));
  return json({ started: true });
};
