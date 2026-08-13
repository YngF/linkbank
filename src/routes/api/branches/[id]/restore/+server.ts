import type { RequestHandler } from './$types';
import { handle } from '$lib/server/respond';
import { restoreBranch } from '$lib/server/mutations';

export const POST: RequestHandler = async ({ params, locals }) => {
  const id = Number(params.id);
  return handle(locals.userId, (uid) => restoreBranch(uid, id));
};
