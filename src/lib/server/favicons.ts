import { db } from './db/index';
import { env } from '$env/dynamic/private';
import http from 'node:http';
import https from 'node:https';
import { Readable } from 'node:stream';

/**
 * Self-contained favicon fetching + caching. No external service.
 *
 * On first request for a host we fetch the site's page, pick the best icon it
 * declares (apple-touch-icon → <link rel=icon> → /favicon.ico), download it,
 * and cache the bytes per-host in the database. Subsequent requests serve from
 * cache; the browser caches too (via headers on the route).
 *
 * Notes:
 *  - LAN hosts (e.g. truenas3.v33.lan) are fetched normally — that's intended
 *    for homelab use, so we do NOT block private address ranges. The fetch
 *    endpoint requires a signed-in user, so it isn't an open SSRF proxy.
 *  - Non-standard ports are respected: the cache key and fetch target both use
 *    the URL's host/origin, which include a non-default port.
 *  - Timeouts + size caps keep a slow or huge target from hurting us.
 *  - FAVICON_ALLOW_INSECURE_TLS=1 relaxes TLS-cert verification for THIS
 *    fetcher only (self-signed LAN services on https). When on, favicon fetches
 *    go through Node's http/https modules with cert checks disabled; every
 *    other request in the app still uses the normal, fully-validating fetch.
 */

// Opt-in insecure TLS, scoped to favicon fetches only. Read via SvelteKit's
// dynamic private env so it picks the value up from `.env` in dev AND from the
// real process environment in production (adapter-node) — plain process.env
// would miss the `.env` file under `npm run dev`.
const ALLOW_INSECURE_TLS = /^(1|true|yes|on)$/i.test(
  env.FAVICON_ALLOW_INSECURE_TLS ?? ''
);

const OK_TTL = 30 * 864e5; // refetch successful icons after 30 days
const FAIL_TTL = 1 * 864e5; // retry failures after 1 day
const HTML_CAP = 500_000; // bytes of HTML to scan for <link> tags
const IMG_CAP = 512_000; // max icon size to store
const TIMEOUT = 6000;

export interface Favicon {
  data: Uint8Array;
  contentType: string;
}

const inflight = new Map<string, Promise<Favicon | null>>();

/** Cached bytes for a host, or null if there's no usable icon. */
export async function getFavicon(pageUrl: string): Promise<Favicon | null> {
  let host: string;
  let origin: string;
  try {
    const u = new URL(pageUrl);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    host = u.host;
    origin = u.origin;
  } catch {
    return null;
  }

  const row = await db.selectFrom('favicons').selectAll().where('host', '=', host).executeTakeFirst();
  if (row) {
    // A manually-uploaded icon is authoritative and never auto-refetched.
    if (row.is_manual) {
      return row.data ? { data: row.data, contentType: row.content_type ?? 'image/x-icon' } : null;
    }
    const age = Date.now() - new Date(row.fetched_at.replace(' ', 'T') + 'Z').getTime();
    const fresh = row.ok ? age < OK_TTL : age < FAIL_TTL;
    if (fresh) {
      return row.ok && row.data ? { data: row.data, contentType: row.content_type ?? 'image/x-icon' } : null;
    }
  }

  // De-dupe concurrent fetches for the same host.
  if (inflight.has(host)) return inflight.get(host)!;
  const job = (async () => {
    const found = await fetchBest(origin);
    await db
      .insertInto('favicons')
      .values({
        host,
        data: found?.data ?? null,
        content_type: found?.contentType ?? null,
        ok: found ? 1 : 0,
        fetched_at: new Date().toISOString().replace('T', ' ').slice(0, 19)
      })
      .onConflict((oc) =>
        oc.column('host').doUpdateSet({
          data: found?.data ?? null,
          content_type: found?.contentType ?? null,
          ok: found ? 1 : 0,
          fetched_at: new Date().toISOString().replace('T', ' ').slice(0, 19)
        })
      )
      .execute();
    return found;
  })().finally(() => inflight.delete(host));

  inflight.set(host, job);
  return job;
}

function hostOf(pageUrl: string): string | null {
  try {
    const u = new URL(pageUrl);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.host;
  } catch {
    return null;
  }
}

/** Detect an image from magic bytes; returns a content-type or null. */
export function sniffImage(data: Uint8Array, declared?: string): string | null {
  const ct = (declared ?? '').split(';')[0].trim().toLowerCase();
  if (ct.startsWith('image/')) return ct;
  if (data[0] === 0x00 && data[1] === 0x00 && data[2] === 0x01) return 'image/x-icon';
  if (data[0] === 0x89 && data[1] === 0x50) return 'image/png';
  if (data[0] === 0x47 && data[1] === 0x49) return 'image/gif';
  if (data[0] === 0xff && data[1] === 0xd8) return 'image/jpeg';
  if (data[0] === 0x3c) return 'image/svg+xml';
  return null;
}

/** Store a manually-uploaded icon for a URL's host. */
export async function setManualFavicon(pageUrl: string, data: Uint8Array, contentType: string): Promise<boolean> {
  const host = hostOf(pageUrl);
  if (!host) return false;
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  await db
    .insertInto('favicons')
    .values({ host, data, content_type: contentType, ok: 1, is_manual: 1, fetched_at: now })
    .onConflict((oc) =>
      oc.column('host').doUpdateSet({ data, content_type: contentType, ok: 1, is_manual: 1, fetched_at: now })
    )
    .execute();
  return true;
}

/** Remove any cached icon for a host so the next request auto-refetches. */
export async function clearFavicon(pageUrl: string): Promise<boolean> {
  const host = hostOf(pageUrl);
  if (!host) return false;
  await db.deleteFrom('favicons').where('host', '=', host).execute();
  return true;
}

async function timedFetch(url: string, accept: string): Promise<Response | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    if (ALLOW_INSECURE_TLS) return await insecureFetch(url, accept, ctrl.signal);
    return await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: { accept, 'user-agent': 'LinkBank/0.1 (+favicon)' }
    });
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Fetch via Node's http/https with TLS verification disabled, for the opt-in
 * self-signed-cert path. Returns a standard web Response (so readCapped and the
 * rest of the pipeline are unchanged). Follows a few redirects manually, since
 * http.request doesn't. Only reached when FAVICON_ALLOW_INSECURE_TLS is set.
 */
async function insecureFetch(
  url: string,
  accept: string,
  signal: AbortSignal
): Promise<Response | null> {
  let current = url;
  for (let hop = 0; hop < 5; hop++) {
    let u: URL;
    try {
      u = new URL(current);
    } catch {
      return null;
    }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    const mod = u.protocol === 'https:' ? https : http;

    const res = await new Promise<http.IncomingMessage | null>((resolve) => {
      const req = mod.request(
        u,
        {
          method: 'GET',
          signal,
          headers: { accept, 'user-agent': 'LinkBank/0.1 (+favicon)' },
          // Only meaningful for https; ignored for http.
          rejectUnauthorized: false
        },
        resolve
      );
      req.on('error', () => resolve(null));
      req.end();
    });
    if (!res) return null;

    const status = res.statusCode ?? 0;
    const location = res.headers.location;
    if (status >= 300 && status < 400 && location) {
      res.resume(); // drain so the socket frees up
      current = new URL(location, current).href;
      continue;
    }

    const headers = new Headers();
    for (const [k, v] of Object.entries(res.headers)) {
      if (Array.isArray(v)) headers.set(k, v.join(', '));
      else if (v != null) headers.set(k, v);
    }
    const body = Readable.toWeb(res) as unknown as ReadableStream<Uint8Array>;
    return new Response(body, { status, headers });
  }
  return null; // too many redirects
}

async function readCapped(res: Response, cap: number): Promise<Buffer | null> {
  const reader = res.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.length;
      if (total > cap) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  }
  return Buffer.concat(chunks);
}

/** Try the page's declared icons, then /favicon.ico; return the first image. */
async function fetchBest(origin: string): Promise<Favicon | null> {
  const candidates: string[] = [];

  const page = await timedFetch(origin, 'text/html');
  if (page && page.ok) {
    const buf = await readCapped(page, HTML_CAP);
    const html = buf ? buf.toString('utf8') : '';
    for (const c of parseIconLinks(html, origin)) candidates.push(c);
  }
  candidates.push(new URL('/favicon.ico', origin).href); // universal fallback

  const seen = new Set<string>();
  for (const url of candidates) {
    if (seen.has(url)) continue;
    seen.add(url);
    const icon = await fetchImage(url);
    if (icon) return icon;
  }
  return null;
}

async function fetchImage(url: string): Promise<Favicon | null> {
  const res = await timedFetch(url, 'image/*,*/*');
  if (!res || !res.ok) return null;
  const ct = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  const data = await readCapped(res, IMG_CAP);
  if (!data || data.length === 0) return null;
  // Accept declared image types, or sniff common magic bytes (some servers
  // mislabel .ico as text/plain or octet-stream).
  const looksImage =
    ct.startsWith('image/') ||
    (data[0] === 0x00 && data[1] === 0x00 && data[2] === 0x01) || // .ico
    (data[0] === 0x89 && data[1] === 0x50) || // .png
    (data[0] === 0x47 && data[1] === 0x49) || // .gif
    (data[0] === 0xff && data[1] === 0xd8) || // .jpg
    (data[0] === 0x3c); // '<' → svg/xml
  if (!looksImage) return null;
  const contentType = ct.startsWith('image/')
    ? ct
    : data[0] === 0x3c
      ? 'image/svg+xml'
      : 'image/x-icon';
  return { data, contentType };
}

/** Extract + rank icon URLs declared in the page head. */
function parseIconLinks(html: string, origin: string): string[] {
  const head = html.slice(0, HTML_CAP);
  const scored: { url: string; score: number }[] = [];
  for (const m of head.matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0];
    const rel = (/\brel\s*=\s*["']?([^"'>]*)/i.exec(tag)?.[1] ?? '').toLowerCase();
    if (!/icon/.test(rel)) continue;
    const href = /\bhref\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
    if (!href) continue;
    let url: string;
    try {
      url = new URL(href, origin).href;
    } catch {
      continue;
    }
    const sizes = /\bsizes\s*=\s*["']?([^"'>\s]*)/i.exec(tag)?.[1] ?? '';
    const size = sizes === 'any' ? 512 : parseInt(sizes, 10) || 0;
    let score = size;
    if (rel.includes('apple-touch-icon')) score += 1000; // usually crisp (≥120px)
    else if (rel.includes('mask-icon')) score += 200;
    else score += 300; // rel="icon"
    scored.push({ url, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.url);
}
