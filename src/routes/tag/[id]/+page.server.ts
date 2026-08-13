import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { getTag, listBookmarksByTag } from '$lib/server/tags';

export const load: PageServerLoad = async ({ params, locals }) => {
  if (locals.userId == null) return { tag: null, bookmarks: [] };
  const id = Number(params.id);
  const tag = Number.isInteger(id) ? await getTag(locals.userId, id) : null;
  // A tag with no bookmarks is auto-removed, so a stale/empty tag URL (e.g. after
  // untagging the last bookmark) just sends you back to the top level.
  if (!tag) throw redirect(303, '/');
  return { tag, bookmarks: await listBookmarksByTag(locals.userId, id) };
};
