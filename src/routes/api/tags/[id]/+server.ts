import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { renameTag, setTagHue, deleteTag } from '$lib/server/tags';

// PATCH /api/tags/[id]  { name?, hue? }  — rename and/or recolour a tag.
export const PATCH: RequestHandler = async ({ params, request, locals }) => {
  const userId = locals.userId;
  if (userId == null) return json({ error: 'Not signed in' }, { status: 401 });
  const id = Number(params.id);
  const body = await request.json().catch(() => ({}));

  if (body.name !== undefined) {
    const r = await renameTag(userId, id, String(body.name));
    if (!r.ok) return json({ error: r.error }, { status: 400 });
  }
  if (body.hue !== undefined) {
    await setTagHue(userId, id, body.hue === null ? null : Number(body.hue));
  }
  return json({ ok: true });
};

// DELETE /api/tags/[id] — remove a tag (and its assignments).
export const DELETE: RequestHandler = async ({ params, locals }) => {
  const userId = locals.userId;
  if (userId == null) return json({ error: 'Not signed in' }, { status: 401 });
  await deleteTag(userId, Number(params.id));
  return json({ ok: true });
};
