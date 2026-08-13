import type { PageServerLoad } from './$types';
import { getTree } from '$lib/server/tree';
import { listBookmarks } from '$lib/server/bookmarks';

// The home page shows the root folder's contents.
export const load: PageServerLoad = async ({ locals }) => {
  const userId = locals.userId ?? 1;
  const tree = await getTree(userId);
  const root = tree[0] ?? null;

  const bookmarks = root ? await listBookmarks(userId, root.id) : [];

  return {
    title: root?.name ?? 'LinkBank',
    rootId: root?.id ?? null,
    folders: root?.children ?? [],
    bookmarks
  };
};
