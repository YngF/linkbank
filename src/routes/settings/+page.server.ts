import type { PageServerLoad } from './$types';
import { getAccount, listApiTokens } from '$lib/server/auth';
import { getSettings, DEFAULT_SETTINGS } from '$lib/server/prefs';

export const load: PageServerLoad = async ({ locals }) => {
  if (locals.userId == null) return { account: null, tokens: [], settings: DEFAULT_SETTINGS };
  return {
    account: await getAccount(locals.userId),
    tokens: await listApiTokens(locals.userId),
    settings: await getSettings(locals.userId)
  };
};
