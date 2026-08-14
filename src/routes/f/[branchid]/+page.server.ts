import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { getTree, getBranchPath } from '$lib/server/tree';
import { listBookmarks } from '$lib/server/bookmarks';
import type { TreeNode } from '$lib/server/db/types';

function findNode(nodes: TreeNode[], id: number): TreeNode | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    const hit = findNode(n.children, id);
    if (hit) return hit;
  }
  return null;
}

export const load: PageServerLoad = async ({ params, locals, cookies }) => {
  const userId = locals.userId ?? 1;
  const branchId = Number(params.branchid);
  if (!Number.isInteger(branchId)) throw error(400, 'Bad folder id');

  const tree = await getTree(userId);
  const node = findNode(tree, branchId);
  if (!node) throw error(404, 'Folder not found');

  // Remember the last folder viewed (per browser) so the "resume on launch"
  // setting can send you back here. Just an id — nothing sensitive.
  if (locals.userId != null) {
    cookies.set('lb_last_folder', String(branchId), {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 365
    });
  }

  const [crumbs, bookmarks] = await Promise.all([
    getBranchPath(userId, branchId),
    listBookmarks(userId, branchId)
  ]);

  return {
    title: node.name,
    crumbs,
    folders: node.children,
    bookmarks
  };
};
