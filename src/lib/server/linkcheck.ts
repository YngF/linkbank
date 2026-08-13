import { sql } from 'kysely';
import { db } from './db/index';
import { env } from '$env/dynamic/private';
import http from 'node:http';
import https from 'node:https';

/**
 * Link-rot checking. Periodically (and on demand) probes each bookmark's URL
 * and records whether it's reachable, so dead links surface in the UI.
 *
 * Philosophy: "reachable = healthy". Any HTTP response means the host answered,
 * so we only flag genuine failures — DNS/connection/timeout errors, 404/410,
 * and 5xx. Auth walls (401/403) and redirects (3xx) count as alive, which is
 * what you want for gated LAN services.
 *
 * TLS: honours the same FAVICON_ALLOW_INSECURE_TLS opt-in, so self-signed LAN
 * sites aren't wrongly reported as broken.
 */

const ALLOW_INSECURE_TLS = /^(1|true|yes|on)$/i.test(env.FAVICON_ALLOW_INSECURE_TLS ?? '');
const INTERVAL_HOURS = Number(env.LINK_CHECK_INTERVAL_HOURS ?? '24');
const TIMEOUT = Number(env.LINK_CHECK_TIMEOUT_MS ?? '8000') || 8000;
const CONCURRENCY = 8;
// Present as a real browser: some servers 404/403/deny non-browser agents, and
// we want the check to mirror what happens when you actually follow the link.
const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36 LinkBank-LinkCheck';

function nowIso(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

// ---- probing ---------------------------------------------------------------

export interface CheckResult {
  code: number; // HTTP status, or 0 on a network-level failure
  ok: boolean; // true = reachable/healthy
  detail: string; // human-readable reason
}

/** One request; resolves the HTTP status code, or rejects with a node error. */
function httpStatus(target: string, method: 'HEAD' | 'GET', signal: AbortSignal): Promise<number> {
  return new Promise((resolve, reject) => {
    let u: URL;
    try {
      u = new URL(target);
    } catch {
      return reject(Object.assign(new Error('bad url'), { code: 'BADURL' }));
    }
    const mod = u.protocol === 'https:' ? https : http;
    const req = mod.request(
      u,
      {
        method,
        signal,
        headers: { 'user-agent': UA, accept: '*/*' },
        rejectUnauthorized: !ALLOW_INSECURE_TLS
      },
      (res) => {
        const code = res.statusCode ?? 0;
        res.destroy(); // we only need the status line, not the body
        resolve(code);
      }
    );
    req.on('error', reject);
    req.end();
  });
}

function classifyCode(code: number): CheckResult {
  if (code === 404) return { code, ok: false, detail: 'Not found (404)' };
  if (code === 410) return { code, ok: false, detail: 'Gone (410)' };
  if (code >= 500) return { code, ok: false, detail: `Server error (${code})` };
  if (code === 401 || code === 403) return { code, ok: true, detail: `Reachable — auth required (${code})` };
  if (code >= 300 && code < 400) return { code, ok: true, detail: `Redirect (${code})` };
  if (code >= 200 && code < 300) return { code, ok: true, detail: `OK (${code})` };
  return { code, ok: true, detail: `Reachable (${code})` };
}

function classifyError(e: unknown): CheckResult {
  const err = e as { name?: string; code?: string; cause?: { code?: string } };
  const c = err?.code ?? err?.cause?.code ?? '';
  let detail = 'Unreachable';
  if (err?.name === 'AbortError' || c === 'ABORT_ERR' || c === 'ETIMEDOUT' || c === 'UND_ERR_HEADERS_TIMEOUT')
    detail = 'Timed out';
  else if (c === 'ENOTFOUND' || c === 'EAI_AGAIN') detail = 'DNS lookup failed';
  else if (c === 'ECONNREFUSED') detail = 'Connection refused';
  else if (c === 'ECONNRESET') detail = 'Connection reset';
  else if (c === 'BADURL') detail = 'Invalid URL';
  else if (/CERT|SSL|TLS|ERR_TLS/i.test(c)) detail = 'TLS certificate error';
  return { code: 0, ok: false, detail };
}

/** One request, classified (status code or network error). */
async function probe(url: string, method: 'HEAD' | 'GET', signal: AbortSignal): Promise<CheckResult> {
  try {
    return classifyCode(await httpStatus(url, method, signal));
  } catch (e) {
    return classifyError(e);
  }
}

/**
 * Check a single URL. HEAD first (cheap, no body); but a HEAD that looks broken
 * — a 404/410/5xx or a network error — is CONFIRMED with a real GET before we
 * flag it. Many servers mishandle HEAD (returning 404/405) even though the page
 * loads fine in a browser, so GET is authoritative and kills those false
 * positives. Non-http URLs (e.g. "note"/"memo" cards) are never checked.
 */
export async function checkOne(rawUrl: string): Promise<CheckResult> {
  const url = rawUrl.trim();
  if (!/^https?:\/\//i.test(url)) {
    return { code: 0, ok: true, detail: 'Skipped (not an http/https link)' };
  }
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const head = await probe(url, 'HEAD', ctrl.signal);
    if (head.ok) return head;
    // HEAD said broken — confirm with a GET that mirrors following the link.
    return await probe(url, 'GET', ctrl.signal);
  } finally {
    clearTimeout(t);
  }
}

// ---- sweeps ----------------------------------------------------------------

export interface LinkProgress {
  running: boolean;
  total: number;
  done: number;
  broken: number;
  startedAt: string | null;
  finishedAt: string | null;
}

let progress: LinkProgress = {
  running: false,
  total: 0,
  done: 0,
  broken: 0,
  startedAt: null,
  finishedAt: null
};

export function linkProgress(): LinkProgress {
  return { ...progress };
}

function isDue(checkedAt: string | null): boolean {
  if (!checkedAt) return true;
  const age = Date.now() - new Date(checkedAt.replace(' ', 'T') + 'Z').getTime();
  return age >= INTERVAL_HOURS * 3600_000;
}

/** Run `worker` over `items` with at most `limit` in flight at once. */
async function pool<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let i = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const item = items[i++];
      await worker(item);
    }
  });
  await Promise.all(runners);
}

async function persist(id: number, res: CheckResult): Promise<void> {
  await db
    .updateTable('bookmarks')
    .set({
      link_status: res.ok ? 'ok' : 'broken',
      link_code: res.code,
      link_detail: res.detail,
      link_checked_at: nowIso()
    })
    .where('id', '=', id)
    .execute();
}

/**
 * Sweep bookmarks and record their health. One sweep runs at a time (further
 * calls are ignored while one is in progress).
 *  - userId: limit to one user (manual runs); omit to sweep everyone (scheduler)
 *  - onlyDue: skip bookmarks checked within the interval (scheduler)
 */
export async function runSweep(opts: { userId?: number; onlyDue?: boolean } = {}): Promise<LinkProgress> {
  if (progress.running) return { ...progress };
  progress = { running: true, total: 0, done: 0, broken: 0, startedAt: nowIso(), finishedAt: null };
  try {
    let q = db
      .selectFrom('bookmarks')
      .select(['id', 'url', 'link_checked_at'])
      .where('is_deleted', '=', 0)
      .where('link_ignore', '=', 0); // exempt whitelisted links
    if (opts.userId != null) q = q.where('user_id', '=', opts.userId);
    let rows = await q.execute();
    if (opts.onlyDue) rows = rows.filter((r) => isDue(r.link_checked_at));

    progress.total = rows.length;
    await pool(rows, CONCURRENCY, async (r) => {
      const res = await checkOne(r.url);
      await persist(r.id, res);
      progress.done++;
      if (!res.ok) progress.broken++;
    });
  } catch (err) {
    console.error('[linkcheck] sweep failed:', err);
  } finally {
    progress.running = false;
    progress.finishedAt = nowIso();
  }
  return { ...progress };
}

/** Re-check a single bookmark (owned by userId). Returns null if not found. */
export async function checkBookmark(
  userId: number,
  id: number
): Promise<(CheckResult & { id: number; checked_at: string }) | null> {
  const row = await db
    .selectFrom('bookmarks')
    .select(['id', 'url'])
    .where('id', '=', id)
    .where('user_id', '=', userId)
    .where('is_deleted', '=', 0)
    .executeTakeFirst();
  if (!row) return null;
  const res = await checkOne(row.url);
  await persist(id, res);
  return { ...res, id, checked_at: nowIso() };
}

// ---- reads for the UI ------------------------------------------------------

export interface BrokenLink {
  id: number;
  title: string;
  url: string;
  branch_id: number;
  code: number | null;
  detail: string | null;
  checked_at: string | null;
  path: string;
}

/** Broken bookmarks for a user, with their folder path, worst offenders first. */
export async function listBrokenLinks(userId: number): Promise<BrokenLink[]> {
  const branches = await db
    .selectFrom('branches')
    .select(['id', 'name', 'parent_id'])
    .where('user_id', '=', userId)
    .execute();
  const byId = new Map(branches.map((b) => [b.id, b]));
  const pathStr = (id: number | null): string => {
    const out: string[] = [];
    let cur = id;
    while (cur != null) {
      const n = byId.get(cur);
      if (!n) break;
      out.unshift(n.name);
      cur = n.parent_id;
    }
    return out.slice(1).join(' / '); // drop the root's own name
  };

  const rows = await db
    .selectFrom('bookmarks')
    .select(['id', 'title', 'url', 'branch_id', 'link_code', 'link_detail', 'link_checked_at'])
    .where('user_id', '=', userId)
    .where('is_deleted', '=', 0)
    .where('link_ignore', '=', 0)
    .where('link_status', '=', 'broken')
    .execute();

  return rows
    .map((r) => ({
      id: r.id,
      title: r.title,
      url: r.url,
      branch_id: r.branch_id,
      code: r.link_code,
      detail: r.link_detail,
      checked_at: r.link_checked_at,
      path: pathStr(r.branch_id)
    }))
    .sort((a, b) => (b.checked_at ?? '').localeCompare(a.checked_at ?? ''));
}

export interface ExemptLink {
  id: number;
  title: string;
  url: string;
  branch_id: number;
  path: string;
}

/** Bookmarks the user has excluded from link checking, with their folder path. */
export async function listExemptLinks(userId: number): Promise<ExemptLink[]> {
  const branches = await db
    .selectFrom('branches')
    .select(['id', 'name', 'parent_id'])
    .where('user_id', '=', userId)
    .execute();
  const byId = new Map(branches.map((b) => [b.id, b]));
  const pathStr = (id: number | null): string => {
    const out: string[] = [];
    let cur = id;
    while (cur != null) {
      const n = byId.get(cur);
      if (!n) break;
      out.unshift(n.name);
      cur = n.parent_id;
    }
    return out.slice(1).join(' / '); // drop the root's own name
  };

  const rows = await db
    .selectFrom('bookmarks')
    .select(['id', 'title', 'url', 'branch_id'])
    .where('user_id', '=', userId)
    .where('is_deleted', '=', 0)
    .where('link_ignore', '=', 1)
    .execute();

  return rows
    .map((r) => ({
      id: r.id,
      title: r.title,
      url: r.url,
      branch_id: r.branch_id,
      path: pathStr(r.branch_id)
    }))
    .sort((a, b) => a.title.localeCompare(b.title));
}

export async function brokenCount(userId: number): Promise<number> {
  const r = await db
    .selectFrom('bookmarks')
    .select(sql<number>`count(*)`.as('c'))
    .where('user_id', '=', userId)
    .where('is_deleted', '=', 0)
    .where('link_ignore', '=', 0)
    .where('link_status', '=', 'broken')
    .executeTakeFirst();
  return Number(r?.c ?? 0);
}

export interface LinkSummary {
  total: number; // checkable bookmarks (excludes exempted)
  checked: number;
  broken: number;
  unchecked: number;
  exempt: number;
  lastCheckedAt: string | null;
}

export async function linkSummary(userId: number): Promise<LinkSummary> {
  const r = await db
    .selectFrom('bookmarks')
    .select([
      sql<number>`sum(case when link_ignore = 0 then 1 else 0 end)`.as('total'),
      sql<number>`sum(case when link_ignore = 0 and link_status is not null then 1 else 0 end)`.as('checked'),
      sql<number>`sum(case when link_ignore = 0 and link_status = 'broken' then 1 else 0 end)`.as('broken'),
      sql<number>`sum(case when link_ignore = 1 then 1 else 0 end)`.as('exempt'),
      sql<string | null>`max(case when link_ignore = 0 then link_checked_at end)`.as('last')
    ])
    .where('user_id', '=', userId)
    .where('is_deleted', '=', 0)
    .executeTakeFirst();
  const total = Number(r?.total ?? 0);
  const checked = Number(r?.checked ?? 0);
  const broken = Number(r?.broken ?? 0);
  return {
    total,
    checked,
    broken,
    unchecked: total - checked,
    exempt: Number(r?.exempt ?? 0),
    lastCheckedAt: r?.last ?? null
  };
}

// ---- scheduler -------------------------------------------------------------

let scheduled = false;

/** Start the periodic due-check. Safe to call multiple times (idempotent). */
export function startLinkCheckScheduler(): void {
  if (scheduled) return;
  scheduled = true;
  if (!(INTERVAL_HOURS > 0)) {
    console.log('[linkcheck] scheduler disabled (LINK_CHECK_INTERVAL_HOURS=0).');
    return;
  }
  // Stagger the first run so boot isn't slowed; then repeat on the interval.
  setTimeout(() => {
    runSweep({ onlyDue: true }).catch((e) => console.error('[linkcheck]', e));
  }, 20_000).unref?.();
  setInterval(() => {
    runSweep({ onlyDue: true }).catch((e) => console.error('[linkcheck]', e));
  }, INTERVAL_HOURS * 3600_000).unref?.();
  console.log(`[linkcheck] scheduler on: due-checks every ${INTERVAL_HOURS}h.`);
}
