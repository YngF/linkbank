import { env } from '$env/dynamic/private';
import { getJson, setJson, isModuleEnabled } from './appSettings';
import type { Rates } from '$lib/currency';

/**
 * Exchange-rate fetching + caching for the currency module.
 *
 * Rates come from exchangerate-api.com, base EUR:
 *  - By default, the free "open" endpoint (open.er-api.com) — key-less,
 *    updated once daily. This includes UAH, unlike the ECB reference rates
 *    the app used before.
 *  - If an admin sets an API key (Admin → Modules → Currency converter, see
 *    setCurrencyApiKey()), we switch to the keyed v6 endpoint instead, which
 *    updates more frequently. Sign up for a key at
 *    https://app.exchangerate-api.com/sign-up.
 *  - CURRENCY_API_URL still fully overrides the endpoint (e.g. to point at a
 *    mock for testing), taking precedence over any stored API key.
 *
 * We cache the latest set in app_settings and refresh on a schedule (and
 * lazily on read when stale), so the browser can convert instantly and
 * offline once seeded. Exact accuracy isn't the goal here — a same-day rate
 * is plenty for a bookmark manager's currency widget.
 */

const RATES_KEY = 'currency.rates';
const API_KEY_SETTING = 'currency.apiKey';
const OPEN_API_URL = 'https://open.er-api.com/v6/latest/EUR';
const REFRESH_HOURS = Number(env.CURRENCY_REFRESH_HOURS ?? '12') || 12;
const FETCH_TIMEOUT = 8000;

const nowIso = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

let inFlight: Promise<Rates | null> | null = null;

export async function getCachedRates(): Promise<Rates | null> {
  return getJson<Rates | null>(RATES_KEY, null);
}

function ageMs(r: Rates | null): number {
  if (!r?.fetchedAt) return Infinity;
  return Date.now() - new Date(r.fetchedAt.replace(' ', 'T') + 'Z').getTime();
}

// ---- admin-supplied API key -------------------------------------------------

/** The stored exchangerate-api.com key, if an admin has set one. */
export async function getCurrencyApiKey(): Promise<string | null> {
  return getJson<string | null>(API_KEY_SETTING, null);
}

/** Set/clear the exchangerate-api.com key. Blank/whitespace clears it. */
export async function setCurrencyApiKey(key: string | null): Promise<void> {
  const trimmed = key?.trim() || null;
  await setJson(API_KEY_SETTING, trimmed);
}

async function ratesUrl(): Promise<string> {
  if (env.CURRENCY_API_URL) return env.CURRENCY_API_URL;
  const key = await getCurrencyApiKey();
  return key ? `https://v6.exchangerate-api.com/v6/${key}/latest/EUR` : OPEN_API_URL;
}

/** Fetch fresh rates from the API and cache them. Returns null on failure. */
export async function fetchRates(): Promise<Rates | null> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
    try {
      const url = await ratesUrl();
      const res = await fetch(url, { signal: ctrl.signal, headers: { accept: 'application/json' } });
      if (!res.ok) throw new Error(`rates HTTP ${res.status}`);
      const data = (await res.json()) as {
        result?: string;
        base_code?: string;
        rates?: Record<string, number>; // open.er-api.com (key-less)
        conversion_rates?: Record<string, number>; // v6.exchangerate-api.com (keyed)
        time_last_update_unix?: number;
      };
      const ratesObj = data.rates ?? data.conversion_rates;
      if (data.result === 'error' || !ratesObj || typeof ratesObj !== 'object') {
        throw new Error('bad rates payload');
      }
      const rates: Rates = {
        base: data.base_code || 'EUR',
        date: data.time_last_update_unix
          ? new Date(data.time_last_update_unix * 1000).toISOString().slice(0, 10)
          : nowIso().slice(0, 10),
        rates: ratesObj,
        fetchedAt: nowIso()
      };
      await setJson(RATES_KEY, rates);
      return rates;
    } catch (e) {
      console.error('[currency] rate fetch failed:', (e as Error).message);
      return null;
    } finally {
      clearTimeout(t);
      inFlight = null;
    }
  })();
  return inFlight;
}

/**
 * Rates for the UI: returns the cache, refreshing first if it's missing or
 * older than the refresh interval. Never throws — falls back to stale cache.
 */
export async function getRatesForClient(): Promise<Rates | null> {
  const cached = await getCachedRates();
  if (cached && ageMs(cached) < REFRESH_HOURS * 3600_000) return cached;
  const fresh = await fetchRates();
  return fresh ?? cached;
}

// ---- scheduler -------------------------------------------------------------

let scheduled = false;

export function startCurrencyScheduler(): void {
  if (scheduled) return;
  scheduled = true;
  const tick = async () => {
    try {
      if (!(await isModuleEnabled('currency'))) return; // don't hit the API if uninstalled
      const cached = await getCachedRates();
      if (!cached || ageMs(cached) >= REFRESH_HOURS * 3600_000) await fetchRates();
    } catch (e) {
      console.error('[currency]', e);
    }
  };
  setTimeout(tick, 15_000).unref?.(); // stagger the first run off boot
  setInterval(tick, REFRESH_HOURS * 3600_000).unref?.();
  console.log(`[currency] scheduler on: refresh every ${REFRESH_HOURS}h when enabled.`);
}
