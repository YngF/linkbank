import type { RequestHandler } from './$types';
import { handle } from '$lib/server/respond';
import { createBranch } from '$lib/server/mutations';

export const POST: RequestHandler = async ({ request, locals }) => {
  const body = await request.json();
  return handle(locals.userId, (uid) =>
    createBranch(uid, { parentId: Number(body.parentId), name: String(body.name ?? '') })
  );
};
