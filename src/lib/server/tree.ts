import { sql } from 'kysely';
import { db } from './db/index';
import type { TreeNode } from './db/types';

interface FlatRow {
  id: number;
  parent_id: number | null;
  name: string;
  position: number;
  icon: string | null;
  colour: string | null;
  own_count: number; // bookmarks directly in this folder
}

/**
 * Load a user's whole folder tree in one recursive query, then nest it in
 * memory and roll bookmark counts up from the leaves.
 *
 * This is the query that replaces getJSONTree + the whole JSON blob: one round
 * trip, correctly ordered, at any depth.
 */
export async function getTree(userId: number): Promise<TreeNode[]> {
  const rows = (await sql<FlatRow>`
    WITH RECURSIVE tree AS (
      SELECT id, parent_id, name, position, icon, colour, 0 AS depth
      FROM   branches
      WHERE  user_id = ${userId} AND parent_id IS NULL AND is_deleted = 0
      UNION ALL
      SELECT b.id, b.parent_id, b.name, b.position, b.icon, b.colour, t.depth + 1
      FROM   branches b JOIN tree t ON b.parent_id = t.id
      WHERE  b.is_deleted = 0
    )
    SELECT t.id, t.parent_id, t.name, t.position, t.icon, t.colour,
           (SELECT COUNT(*) FROM bookmarks bm
            WHERE bm.branch_id = t.id AND bm.is_deleted = 0) AS own_count
    FROM tree t
    ORDER BY t.parent_id, t.position
  `.execute(db)).rows;

  // build nodes
  const byId = new Map<number, TreeNode>();
  for (const r of rows) {
    byId.set(r.id, {
      id: r.id,
      name: r.name,
      icon: r.icon,
      colour: r.colour,
      count: Number(r.own_count), // Postgres COUNT(*) returns a string
      children: []
    });
  }

  const roots: TreeNode[] = [];
  for (const r of rows) {
    const node = byId.get(r.id)!;
    if (r.parent_id === null) roots.push(node);
    else byId.get(r.parent_id)?.children.push(node);
  }

  // roll descendant counts upward (children already ordered by the query)
  const rollup = (n: TreeNode): number => {
    for (const c of n.children) n.count += rollup(c);
    return n.count;
  };
  for (const root of roots) rollup(root);

  return roots;
}

/** Flat path from root to the given branch, for breadcrumbs. */
export async function getBranchPath(
  userId: number,
  branchId: number
): Promise<{ id: number; name: string }[]> {
  const rows = (await sql<{ id: number; name: string; parent_id: number | null }>`
    WITH RECURSIVE up AS (
      SELECT id, name, parent_id FROM branches
      WHERE id = ${branchId} AND user_id = ${userId}
      UNION ALL
      SELECT b.id, b.name, b.parent_id FROM branches b
      JOIN up ON b.id = up.parent_id
    )
    SELECT id, name, parent_id FROM up
  `.execute(db)).rows;
  return rows.reverse().map((r) => ({ id: r.id, name: r.name }));
}
