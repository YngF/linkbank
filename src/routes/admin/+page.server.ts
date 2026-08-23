import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { listUsers, listInvites } from '$lib/server/admin';
import { getEnabledModules } from '$lib/server/appSettings';
import { getCachedRates, getCurrencyApiKey } from '$lib/server/currency';
import { MODULES } from '$lib/modules';

export const load: PageServerLoad = async ({ locals }) => {
  if (locals.user?.is_admin !== 1) throw redirect(303, '/');
  const enabled = await getEnabledModules();
  const rates = await getCachedRates();
  return {
    users: await listUsers(),
    invites: await listInvites(),
    selfId: locals.user.id,
    modules: MODULES.map((m) => ({ ...m, enabled: enabled.includes(m.id) })),
    ratesDate: rates?.date ?? null,
    ratesFetchedAt: rates?.fetchedAt ?? null,
    // Only whether a key is set, never the key itself — it's write-only from the client.
    hasCurrencyApiKey: !!(await getCurrencyApiKey())
  };
};
