import type { PageServerLoad } from './$types';
import { getAccount, listApiTokens } from '$lib/server/auth';

export const load: PageServerLoad = async ({ locals }) => {
  if (locals.userId == null) return { account: null, tokens: [] };
  return { account: await getAccount(locals.userId), tokens: await listApiTokens(locals.userId) };
};
