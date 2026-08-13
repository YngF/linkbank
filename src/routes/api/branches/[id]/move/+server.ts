import type { RequestHandler } from './$types';
import { handle } from '$lib/server/respond';
import { moveBranch } from '$lib/server/mutations';

export const POST: RequestHandler = async ({ params, request, locals }) => {
  const body = await request.json();
  const id = Number(params.id);
  return handle(locals.userId, (uid) =>
    moveBranch(uid, id, Number(body.toParentId), body.index != null ? Number(body.index) : undefined)
  );
};
