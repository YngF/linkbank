import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';

// The account page was folded into Settings. Keep this path working for old
// links / bookmarks by redirecting.
export const load: PageServerLoad = () => {
  throw redirect(307, '/settings');
};
