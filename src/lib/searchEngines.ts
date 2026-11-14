// Web search engines offered by the top-bar search field. To add one, append
// here — `url(q)` must return the full results URL for the query.

export interface SearchEngine {
  id: string;
  name: string;
  url: (q: string) => string;
}

export const SEARCH_ENGINES: SearchEngine[] = [
  { id: 'google', name: 'Google', url: (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}` },
  { id: 'duckduckgo', name: 'DuckDuckGo', url: (q) => `https://duckduckgo.com/?q=${encodeURIComponent(q)}` },
  { id: 'bing', name: 'Bing', url: (q) => `https://www.bing.com/search?q=${encodeURIComponent(q)}` },
  { id: 'brave', name: 'Brave', url: (q) => `https://search.brave.com/search?q=${encodeURIComponent(q)}` },
  { id: 'startpage', name: 'Startpage', url: (q) => `https://www.startpage.com/sp/search?query=${encodeURIComponent(q)}` },
  { id: 'ecosia', name: 'Ecosia', url: (q) => `https://www.ecosia.org/search?q=${encodeURIComponent(q)}` }
];

export const DEFAULT_ENGINE = 'google';

export function engineById(id: string): SearchEngine {
  return SEARCH_ENGINES.find((e) => e.id === id) ?? SEARCH_ENGINES[0];
}

/**
 * The "custom" engine: the user supplies their own results URL, so a
 * self-hosted SearXNG (or anything else) can be the top-bar search target.
 * The template marks where the query goes with `%s` — `{q}` is accepted too,
 * since that is the other common spelling.
 */
export const CUSTOM_ENGINE_ID = 'custom';

export const ENGINE_IDS = [...SEARCH_ENGINES.map((e) => e.id), CUSTOM_ENGINE_ID];

export const CUSTOM_PLACEHOLDER = '%s';

const PLACEHOLDER_RE = /%s|\{q\}/;

/** Longest template we store; a search URL far beyond this is a mistake. */
const MAX_CUSTOM_URL = 2000;

/**
 * A usable custom template: an absolute http(s) URL containing the query
 * placeholder. The scheme check is the important part — the template is fed to
 * `window.open`, so `javascript:` or `data:` must never reach it.
 */
export function isValidCustomSearchUrl(template: string): boolean {
  const t = template.trim();
  if (!t || t.length > MAX_CUSTOM_URL) return false;
  if (!PLACEHOLDER_RE.test(t)) return false;
  let u: URL;
  try {
    u = new URL(t);
  } catch {
    return false;
  }
  return u.protocol === 'http:' || u.protocol === 'https:';
}

/** Fill a validated template with the query. Returns null if it isn't usable. */
export function customSearchUrl(template: string, q: string): string | null {
  if (!isValidCustomSearchUrl(template)) return null;
  return template.trim().replace(PLACEHOLDER_RE, encodeURIComponent(q));
}

/**
 * The results URL for whichever engine is selected. Returns null only when the
 * custom engine is chosen without a usable template, so callers can say so
 * instead of opening a broken tab.
 */
export function searchUrlFor(engineId: string, customTemplate: string, q: string): string | null {
  if (engineId === CUSTOM_ENGINE_ID) return customSearchUrl(customTemplate, q);
  return engineById(engineId).url(q);
}
