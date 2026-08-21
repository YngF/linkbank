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

export const ENGINE_IDS = SEARCH_ENGINES.map((e) => e.id);
