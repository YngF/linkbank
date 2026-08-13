import type { RequestHandler } from './$types';
import { handle } from '$lib/server/respond';
import { restoreBookmark } from '$lib/server/mutations';

export const POST: RequestHandler = async ({ params, locals }) => {
  const id = Number(params.id);
  return handle(locals.userId, (uid) => restoreBookmark(uid, id));
};
