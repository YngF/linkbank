import type { RequestHandler } from './$types';
import { handle } from '$lib/server/respond';
import { createBookmark } from '$lib/server/mutations';

export const POST: RequestHandler = async ({ request, locals }) => {
  const body = await request.json();
  return handle(locals.userId, (uid) =>
    createBookmark(uid, {
      branchId: Number(body.branchId),
      url: String(body.url ?? ''),
      title: body.title,
      notes: body.notes,
      tags: Array.isArray(body.tags) ? body.tags.map(String) : undefined
    })
  );
};
