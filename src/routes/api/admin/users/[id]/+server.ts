import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { setAdmin, deleteUser } from '$lib/server/admin';

function requireAdmin(locals: App.Locals) {
  return locals.user?.is_admin === 1 ? locals.user : null;
}

// PATCH /api/admin/users/[id] { isAdmin } — grant/revoke admin.
export const PATCH: RequestHandler = async ({ params, request, locals }) => {
  const admin = requireAdmin(locals);
  if (!admin) return json({ error: 'Admins only' }, { status: 403 });
  const id = Number(params.id);
  const body = await request.json().catch(() => ({}));
  if (body.isAdmin !== undefined) {
    const r = await setAdmin(id, !!body.isAdmin);
    if (!r.ok) return json({ error: r.error }, { status: 400 });
  }
  return json({ ok: true });
};

// DELETE /api/admin/users/[id] — remove an (empty) user.
export const DELETE: RequestHandler = async ({ params, locals }) => {
  const admin = requireAdmin(locals);
  if (!admin) return json({ error: 'Admins only' }, { status: 403 });
  const r = await deleteUser(admin.id, Number(params.id));
  if (!r.ok) return json({ error: r.error }, { status: 400 });
  return json({ ok: true });
};
