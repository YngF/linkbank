import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getFavicon, setManualFavicon, clearFavicon, sniffImage } from '$lib/server/favicons';

const MAX_UPLOAD = 512_000;

/**
 * GET  /favicon?u=<url>  — serve the cached favicon (fetch on first request).
 * POST /favicon?u=<url>  — store a manually-uploaded icon (raw image body).
 * DELETE /favicon?u=<url> — clear the cached icon so it auto-fetches again.
 * All require a signed-in user (so it isn't an open fetch proxy).
 */
export const GET: RequestHandler = async ({ url, locals }) => {
  if (locals.userId == null) return new Response('Not signed in', { status: 401 });
  const target = url.searchParams.get('u');
  if (!target) return new Response('missing u', { status: 400 });

  const icon = await getFavicon(target);
  if (!icon) return new Response(null, { status: 404, headers: { 'cache-control': 'public, max-age=86400' } });

  return new Response(icon.data as unknown as BodyInit, {
    headers: {
      'content-type': icon.contentType,
      'cache-control': 'public, max-age=604800',
      'content-length': String(icon.data.length)
    }
  });
};

export const POST: RequestHandler = async ({ url, request, locals }) => {
  if (locals.userId == null) return json({ error: 'Not signed in' }, { status: 401 });
  const target = url.searchParams.get('u');
  if (!target) return json({ error: 'missing u' }, { status: 400 });

  const buf = new Uint8Array(await request.arrayBuffer());
  if (buf.length === 0) return json({ error: 'Empty file' }, { status: 400 });
  if (buf.length > MAX_UPLOAD) return json({ error: 'Image too large (max 512 KB)' }, { status: 413 });

  const contentType = sniffImage(buf, request.headers.get('content-type') ?? undefined);
  if (!contentType) return json({ error: "That doesn't look like an image (PNG, ICO, SVG, GIF, JPG)" }, { status: 400 });

  const ok = await setManualFavicon(target, buf, contentType);
  if (!ok) return json({ error: 'Invalid URL' }, { status: 400 });
  return json({ ok: true });
};

export const DELETE: RequestHandler = async ({ url, locals }) => {
  if (locals.userId == null) return json({ error: 'Not signed in' }, { status: 401 });
  const target = url.searchParams.get('u');
  if (!target) return json({ error: 'missing u' }, { status: 400 });
  await clearFavicon(target);
  return json({ ok: true });
};
