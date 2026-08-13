import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/index';
import { parseNetscape, importInto } from '$lib/server/netscape';

export const POST: RequestHandler = async ({ request, locals }) => {
  if (locals.userId == null) return json({ error: 'Not signed in' }, { status: 401 });
  const userId = locals.userId;

  const { html } = await request.json();
  if (typeof html !== 'string' || html.length < 1)
    return json({ error: 'No bookmark file provided' }, { status: 400 });

  const nodes = parseNetscape(html);
  const total = countLinks(nodes);
  if (total === 0) return json({ error: "Couldn't find any bookmarks in that file" }, { status: 400 });

  // Find the user's root, then import everything into a fresh, timestamped
  // folder under it — additive and non-destructive.
  const root = await db
    .selectFrom('branches')
    .select('id')
    .where('user_id', '=', userId)
    .where('parent_id', 'is', null)
    .where('is_deleted', '=', 0)
    .executeTakeFirst();
  if (!root) return json({ error: 'No root folder for this user' }, { status: 500 });

  const posMax = await db
    .selectFrom('branches')
    .select((eb) => eb.fn.max('position').as('m'))
    .where('parent_id', '=', root.id)
    .where('user_id', '=', userId)
    .executeTakeFirst();

  const name = `Imported ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`;
  const folder = await db
    .insertInto('branches')
    .values({ user_id: userId, parent_id: root.id, name, position: (Number(posMax?.m) || 0) + 1 })
    .returning('id')
    .executeTakeFirstOrThrow();

  const counts = await importInto(userId, Number(folder.id), nodes);
  return json({ ...counts, into: name, intoId: Number(folder.id) });
};

function countLinks(nodes: import('$lib/server/netscape').ParsedNode[]): number {
  let n = 0;
  for (const x of nodes) {
    if (x.type === 'link') n++;
    else n += countLinks(x.children);
  }
  return n;
}
