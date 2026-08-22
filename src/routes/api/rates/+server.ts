import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isModuleEnabled } from '$lib/server/appSettings';
import { getRatesForClient } from '$lib/server/currency';

// GET /api/rates — cached exchange rates for the currency converter.
// 404 when the module is disabled; 503 when rates can't be obtained yet.
export const GET: RequestHandler = async ({ locals }) => {
  if (locals.userId == null) return json({ error: 'Not signed in' }, { status: 401 });
  if (!(await isModuleEnabled('currency'))) return json({ error: 'Module disabled' }, { status: 404 });
  const rates = await getRatesForClient();
  if (!rates) return json({ error: 'Rates unavailable' }, { status: 503 });
  return json(rates, { headers: { 'cache-control': 'private, max-age=300' } });
};
