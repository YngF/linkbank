import type { PageServerLoad } from './$types';
import { listBrokenLinks, linkSummary } from '$lib/server/linkcheck';

export const load: PageServerLoad = async ({ locals }) => {
  if (locals.userId == null) {
    return {
      broken: [],
      summary: { total: 0, checked: 0, broken: 0, unchecked: 0, exempt: 0, lastCheckedAt: null }
    };
  }
  return {
    broken: await listBrokenLinks(locals.userId),
    summary: await linkSummary(locals.userId)
  };
};
