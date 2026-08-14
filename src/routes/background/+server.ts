import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getBackground, setBackground, deleteBackground, sniffBackground } from '$lib/server/background';

const MAX_UPLOAD = 8_000_000; // 8 MB

/**
 * GET    /background — serve the signed-in user's background image (404 if none).
 * POST   /background — store an uploaded image (raw bytes as the request body).
 * DELETE /background — remove it.
 */
export const GET: RequestHandler = async ({ locals }) => {
  if (locals.userId == null) return new Response('Not signed in', { status: 401 });
  const bg = await getBackground(locals.userId);
  if (!bg) return new Response(null, { status: 404 });
  return new Response(bg.data as unknown as BodyInit, {
    headers: {
      'content-type': bg.contentType,
      'content-length': String(bg.data.length),
      // The URL carries a ?v=<updatedAt> cache-buster, so this can cache hard.
      'cache-control': 'private, max-age=31536000, immutable'
    }
  });
};

export const POST: RequestHandler = async ({ request, locals }) => {
  if (locals.userId == null) return json({ error: 'Not signed in' }, { status: 401 });

  const buf = new Uint8Array(await request.arrayBuffer());
  if (buf.length === 0) return json({ error: 'Empty file' }, { status: 400 });
  if (buf.length > MAX_UPLOAD) return json({ error: 'Image too large (max 8 MB)' }, { status: 413 });

  const contentType = sniffBackground(buf, request.headers.get('content-type') ?? undefined);
  if (!contentType) return json({ error: "That doesn't look like an image (PNG, JPG, GIF, or WebP)" }, { status: 400 });

  await setBackground(locals.userId, buf, contentType);
  return json({ ok: true });
};

export const DELETE: RequestHandler = async ({ locals }) => {
  if (locals.userId == null) return json({ error: 'Not signed in' }, { status: 401 });
  await deleteBackground(locals.userId);
  return json({ ok: true });
};
