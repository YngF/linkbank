import { db } from './db/index';
import { MODULE_IDS, isModuleId } from '$lib/modules';

/**
 * Instance-wide key/value settings (admin-controlled), stored in `app_settings`.
 * Values are JSON strings. This is the home for module enablement and cached
 * exchange rates.
 */

const now = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

export async function getRaw(key: string): Promise<string | null> {
  const row = await db
    .selectFrom('app_settings')
    .select('value')
    .where('key', '=', key)
    .executeTakeFirst();
  return row?.value ?? null;
}

export async function setRaw(key: string, value: string): Promise<void> {
  const updated_at = now();
  await db
    .insertInto('app_settings')
    .values({ key, value, updated_at })
    .onConflict((oc) => oc.column('key').doUpdateSet({ value, updated_at }))
    .execute();
}

export async function getJson<T>(key: string, fallback: T): Promise<T> {
  const raw = await getRaw(key);
  if (raw == null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function setJson(key: string, value: unknown): Promise<void> {
  await setRaw(key, JSON.stringify(value));
}

// ---- module enablement -----------------------------------------------------

const MODULES_KEY = 'modules.enabled';

/** Ids of admin-enabled modules (filtered to ones that still exist). */
export async function getEnabledModules(): Promise<string[]> {
  const ids = await getJson<string[]>(MODULES_KEY, []);
  return Array.isArray(ids) ? ids.filter((id) => MODULE_IDS.includes(id)) : [];
}

export async function isModuleEnabled(id: string): Promise<boolean> {
  return (await getEnabledModules()).includes(id);
}

/** Enable/disable a module for the whole instance. Returns the new enabled set. */
export async function setModuleEnabled(id: string, enabled: boolean): Promise<string[]> {
  if (!isModuleId(id)) return getEnabledModules();
  const set = new Set(await getEnabledModules());
  if (enabled) set.add(id);
  else set.delete(id);
  const next = [...set];
  await setJson(MODULES_KEY, next);
  return next;
}
