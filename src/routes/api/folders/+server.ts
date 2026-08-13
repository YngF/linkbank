import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getTree } from '$lib/server/tree';
import type { TreeNode } from '$lib/server/db/types';

/** GET /api/folders — the user's folders, flattened with depth (for pickers). */
export const GET: RequestHandler = async ({ locals }) => {
  const userId = locals.userId;
  if (userId == null) return json({ error: 'Not signed in' }, { status: 401 });
  const tree = await getTree(userId);
  const out: { id: number; name: string; depth: number }[] = [];
  const walk = (nodes: TreeNode[], depth: number) => {
    for (const n of nodes) {
      out.push({ id: n.id, name: n.name, depth });
      if (n.children.length) walk(n.children, depth + 1);
    }
  };
  walk(tree, 0);
  return json({ folders: out });
};
