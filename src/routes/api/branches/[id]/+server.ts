import type { RequestHandler } from './$types';
import { handle } from '$lib/server/respond';
import { renameBranch, deleteBranch, purgeBranch } from '$lib/server/mutations';

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
  const body = await request.json();
  const id = Number(params.id);
  return handle(locals.userId, (uid) => renameBranch(uid, id, String(body.name ?? '')));
};

export const DELETE: RequestHandler = async ({ params, url, locals }) => {
  const id = Number(params.id);
  const hard = url.searchParams.get('hard') === '1';
  return handle(locals.userId, (uid) => (hard ? purgeBranch(uid, id) : deleteBranch(uid, id)));
};
