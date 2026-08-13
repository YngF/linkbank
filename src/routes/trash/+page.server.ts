import type { PageServerLoad } from './$types';
import { listTrash } from '$lib/server/trash';

export const load: PageServerLoad = async ({ locals }) => {
  if (locals.userId == null) return { items: [] };
  return { items: await listTrash(locals.userId) };
};
