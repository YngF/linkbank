import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { setModuleEnabled } from '$lib/server/appSettings';
import { isModuleId } from '$lib/modules';
import { fetchRates, setCurrencyApiKey, getCurrencyApiKey } from '$lib/server/currency';

function requireAdmin(locals: App.Locals) {
  return locals.user?.is_admin === 1 ? locals.user : null;
}

// PATCH /api/admin/modules { id, enabled } — install/uninstall a module.
export const PATCH: RequestHandler = async ({ request, locals }) => {
  if (!requireAdmin(locals)) return json({ error: 'Admins only' }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  if (!isModuleId(body.id)) return json({ error: 'Unknown module' }, { status: 400 });

  const enabled = await setModuleEnabled(body.id, !!body.enabled);
  // Seed exchange rates immediately when the currency module is switched on.
  if (body.id === 'currency' && body.enabled) fetchRates().catch(() => {});
  return json({ ok: true, enabled });
};

// POST /api/admin/modules { action: 'refresh-rates' | 'set-currency-key', ... }
export const POST: RequestHandler = async ({ request, locals }) => {
  if (!requireAdmin(locals)) return json({ error: 'Admins only' }, { status: 403 });
  const body = await request.json().catch(() => ({}));

  if (body.action === 'refresh-rates') {
    const r = await fetchRates();
    if (!r) return json({ error: 'Could not reach the rate service' }, { status: 502 });
    return json({ ok: true, date: r.date, fetchedAt: r.fetchedAt });
  }

  if (body.action === 'set-currency-key') {
    await setCurrencyApiKey(typeof body.apiKey === 'string' ? body.apiKey : null);
    const r = await fetchRates(); // pull immediately with the new key so the admin sees it take effect
    return json({ ok: true, hasApiKey: !!(await getCurrencyApiKey()), date: r?.date ?? null });
  }

  return json({ error: 'Unknown action' }, { status: 400 });
};
