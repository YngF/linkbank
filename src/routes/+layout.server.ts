import type { LayoutServerLoad } from './$types';
import { getTree } from '$lib/server/tree';
import { trashCount } from '$lib/server/trash';
import { brokenCount } from '$lib/server/linkcheck';
import { listTags } from '$lib/server/tags';
import { getBackgroundVersion } from '$lib/server/background';
import { getSettings, DEFAULT_SETTINGS } from '$lib/server/prefs';

export const load: LayoutServerLoad = async ({ locals }) => {
  // Auth pages (login/setup/register) render without a session — no tree.
  if (!locals.user) {
    return {
      username: null, isAdmin: false, tree: [], trashCount: 0, brokenCount: 0,
      tags: [], bgVersion: null, settings: DEFAULT_SETTINGS
    };
  }
  return {
    username: locals.user.username,
    isAdmin: locals.user.is_admin === 1,
    tree: await getTree(locals.user.id),
    trashCount: await trashCount(locals.user.id),
    brokenCount: await brokenCount(locals.user.id),
    tags: await listTags(locals.user.id),
    bgVersion: await getBackgroundVersion(locals.user.id),
    settings: await getSettings(locals.user.id)
  };
};
