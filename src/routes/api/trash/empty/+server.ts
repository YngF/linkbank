import type { RequestHandler } from './$types';
import { handle } from '$lib/server/respond';
import { emptyTrash } from '$lib/server/mutations';

export const POST: RequestHandler = async ({ locals }) => {
  return handle(locals.userId, (uid) => emptyTrash(uid));
};
