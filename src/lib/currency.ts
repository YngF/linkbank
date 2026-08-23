// Shared (client + server) currency helpers. Rates come from Frankfurter
// (ECB daily reference rates), stored with base EUR. UAH is not part of the
// ECB set, so its rate is merged in separately — see fetchUahRate() in
// src/lib/server/currency.ts.

export interface Rates {
  base: string; // 'EUR'
  date: string; // ECB reference date, e.g. '2026-08-21'
  rates: Record<string, number>; // code -> units per 1 base (base itself omitted)
  fetchedAt: string; // when we last fetched
}

// Display names for the ECB currency set (+ EUR). Unknown codes fall back to the code.
export const CURRENCY_NAMES: Record<string, string> = {
  EUR: 'Euro',
  USD: 'US Dollar',
  GBP: 'British Pound',
  JPY: 'Japanese Yen',
  AUD: 'Australian Dollar',
  BRL: 'Brazilian Real',
  CAD: 'Canadian Dollar',
  CHF: 'Swiss Franc',
  CNY: 'Chinese Yuan',
  CZK: 'Czech Koruna',
  DKK: 'Danish Krone',
  HKD: 'Hong Kong Dollar',
  HUF: 'Hungarian Forint',
  IDR: 'Indonesian Rupiah',
  ILS: 'Israeli New Shekel',
  INR: 'Indian Rupee',
  ISK: 'Icelandic Króna',
  KRW: 'South Korean Won',
  MXN: 'Mexican Peso',
  MYR: 'Malaysian Ringgit',
  NOK: 'Norwegian Krone',
  NZD: 'New Zealand Dollar',
  PHP: 'Philippine Peso',
  PLN: 'Polish Złoty',
  RON: 'Romanian Leu',
  SEK: 'Swedish Krona',
  SGD: 'Singapore Dollar',
  THB: 'Thai Baht',
  TRY: 'Turkish Lira',
  UAH: 'Ukrainian Hryvnia',
  ZAR: 'South African Rand'
};

export function currencyName(code: string): string {
  return CURRENCY_NAMES[code] ?? code;
}

/** All available currency codes for a rate set (base first is not assumed — sorted). */
export function currencyCodes(r: Rates): string[] {
  return [r.base, ...Object.keys(r.rates)].sort();
}

function rateOf(code: string, r: Rates): number | undefined {
  if (code === r.base) return 1;
  return r.rates[code];
}

/** Convert `amount` from one currency to another via the base. null if a code is unknown. */
export function convert(amount: number, from: string, to: string, r: Rates): number | null {
  const f = rateOf(from, r);
  const t = rateOf(to, r);
  if (f == null || t == null || !isFinite(amount)) return null;
  return (amount * t) / f;
}
