import { env } from '$env/dynamic/private';
import { getJson, setJson, isModuleEnabled } from './appSettings';
import type { Rates } from '$lib/currency';

/**
 * Exchange-rate fetching + caching for the currency module.
 *
 * Rates come from Frankfurter (https://frankfurter.dev) — the ECB's daily
 * reference rates, free and key-less, base EUR. We cache the latest set in
 * app_settings and refresh on a schedule (and lazily on read when stale), so
 * the browser can convert instantly and offline once seeded.
 *
 * The ECB doesn't publish a UAH rate, so it isn't in the Frankfurter set. We
 * separately fetch EUR→UAH from a second free, key-less source and merge it
 * into the cached rates under the same EUR base — see fetchUahRate() below.
 */

const RATES_KEY = 'currency.rates';
const API = env.CURRENCY_API_URL || 'https://api.frankfurter.dev/v1/latest?base=EUR';
const UAH_API = env.CURRENCY_UAH_API_URL || 'https://open.er-api.com/v6/latest/EUR';
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

/**
 * Fetch just the EUR→UAH rate from the secondary source. Best-effort: a
 * failure here must never break the main ECB rate set, so this only ever
 * returns a number or null (logged), never throws.
 */
async function fetchUahRate(): Promise<number | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
  try {
    const res = await fetch(UAH_API, { signal: ctrl.signal, headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`UAH rate HTTP ${res.status}`);
    const data = (await res.json()) as { rates?: Record<string, number> };
    const uah = data?.rates?.UAH;
    if (typeof uah !== 'number' || !isFinite(uah)) throw new Error('bad UAH rate payload');
    return uah;
  } catch (e) {
    console.error('[currency] UAH rate fetch failed:', (e as Error).message);
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** Fetch fresh rates from the API and cache them. Returns null on failure. */
export async function fetchRates(): Promise<Rates | null> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
    try {
      const res = await fetch(API, { signal: ctrl.signal, headers: { accept: 'application/json' } });
      if (!res.ok) throw new Error(`rates HTTP ${res.status}`);
      const data = (await res.json()) as { base?: string; date?: string; rates?: Record<string, number> };
      if (!data?.rates || typeof data.rates !== 'object') throw new Error('bad rates payload');
      const rates: Rates = {
        base: data.base || 'EUR',
        date: data.date || '',
        rates: data.rates,
        fetchedAt: nowIso()
      };
      const uah = await fetchUahRate();
      if (uah != null) rates.rates.UAH = uah;
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
