import type { PageServerLoad } from './$types';
import { listBrokenLinks, listExemptLinks, linkSummary } from '$lib/server/linkcheck';

export const load: PageServerLoad = async ({ locals }) => {
  if (locals.userId == null) {
    return {
      broken: [],
      exempt: [],
      summary: { total: 0, checked: 0, broken: 0, unchecked: 0, exempt: 0, lastCheckedAt: null }
    };
  }
  const [broken, exempt, summary] = await Promise.all([
    listBrokenLinks(locals.userId),
    listExemptLinks(locals.userId),
    linkSummary(locals.userId)
  ]);
  return { broken, exempt, summary };
};
