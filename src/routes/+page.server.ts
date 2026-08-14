import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { getTree } from '$lib/server/tree';
import { listBookmarks } from '$lib/server/bookmarks';
import { getSettings } from '$lib/server/prefs';
import type { TreeNode } from '$lib/server/db/types';

function findNode(nodes: TreeNode[], id: number): TreeNode | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    const hit = findNode(n.children, id);
    if (hit) return hit;
  }
  return null;
}

// The home page shows the root folder's contents — unless the user has opted to
// resume at their last-visited folder on launch.
export const load: PageServerLoad = async ({ locals, cookies }) => {
  const userId = locals.userId ?? 1;
  const tree = await getTree(userId);
  const root = tree[0] ?? null;

  // Personalization: "open my last folder on launch". The last folder is kept in
  // a per-browser cookie (set on each folder visit). Only redirect when it's a
  // real, still-existing folder other than the root — otherwise fall through and
  // render the top level (and drop the stale cookie), so we never loop or 404.
  if (locals.userId != null && root) {
    const settings = await getSettings(userId);
    if (settings.landOnLastFolder) {
      const raw = cookies.get('lb_last_folder');
      const id = raw ? Number(raw) : NaN;
      if (Number.isInteger(id) && id !== root.id) {
        if (findNode(tree, id)) throw redirect(307, `/f/${id}`);
        cookies.delete('lb_last_folder', { path: '/' });
      }
    }
  }

  const bookmarks = root ? await listBookmarks(userId, root.id) : [];

  return {
    title: root?.name ?? 'LinkBank',
    rootId: root?.id ?? null,
    folders: root?.children ?? [],
    bookmarks
  };
};
