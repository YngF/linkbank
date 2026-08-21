import { db } from './db/index';
import { DEFAULT_ENGINE, ENGINE_IDS } from '$lib/searchEngines';

/**
 * Per-user personalization preferences.
 *
 * Stored as a single JSON document in `users.settings` so new preferences can
 * be added here without a database migration each time. To add one: extend the
 * interface, give it a default in DEFAULT_SETTINGS, and validate it in sanitize().
 */
export interface UserSettings {
  /** On launch (visiting `/`), resume at the last folder viewed in this browser. */
  landOnLastFolder: boolean;
  /** Web-search engine id for the top-bar search field (see searchEngines.ts). */
  searchEngine: string;
}

export const DEFAULT_SETTINGS: UserSettings = {
  landOnLastFolder: false,
  searchEngine: DEFAULT_ENGINE
};

/** Keep only known keys with the right types — never trust stored/incoming JSON. */
function sanitize(obj: unknown): Partial<UserSettings> {
  const out: Partial<UserSettings> = {};
  if (obj && typeof obj === 'object') {
    const o = obj as Record<string, unknown>;
    if (typeof o.landOnLastFolder === 'boolean') out.landOnLastFolder = o.landOnLastFolder;
    if (typeof o.searchEngine === 'string' && ENGINE_IDS.includes(o.searchEngine))
      out.searchEngine = o.searchEngine;
  }
  return out;
}

function parse(raw: string | null | undefined): UserSettings {
  if (!raw) return { ...DEFAULT_SETTINGS };
  try {
    return { ...DEFAULT_SETTINGS, ...sanitize(JSON.parse(raw)) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function getSettings(userId: number): Promise<UserSettings> {
  const row = await db
    .selectFrom('users')
    .select('settings')
    .where('id', '=', userId)
    .executeTakeFirst();
  return parse(row?.settings);
}

/** Merge a partial patch into the user's settings and persist. Returns the result. */
export async function updateSettings(
  userId: number,
  patch: Partial<UserSettings>
): Promise<UserSettings> {
  const next = { ...(await getSettings(userId)), ...sanitize(patch) };
  await db
    .updateTable('users')
    .set({ settings: JSON.stringify(next) })
    .where('id', '=', userId)
    .execute();
  return next;
}
