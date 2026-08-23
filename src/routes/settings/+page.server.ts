import type { PageServerLoad } from './$types';
import { getAccount, listApiTokens } from '$lib/server/auth';
import { getSettings, DEFAULT_SETTINGS } from '$lib/server/prefs';
import { getBackgroundVersion } from '$lib/server/background';
import { getEnabledModules } from '$lib/server/appSettings';

export const load: PageServerLoad = async ({ locals }) => {
  if (locals.userId == null)
    return { account: null, tokens: [], settings: DEFAULT_SETTINGS, bgVersion: null, modules: [] as string[] };
  return {
    account: await getAccount(locals.userId),
    tokens: await listApiTokens(locals.userId),
    settings: await getSettings(locals.userId),
    bgVersion: await getBackgroundVersion(locals.userId),
    modules: await getEnabledModules()
  };
};
