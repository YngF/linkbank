import { type Handle, redirect } from '@sveltejs/kit';
import { building } from '$app/environment';
import { runMigrations } from '$lib/server/db/migrate';
import { validateSession, needsSetup, sessionCookieName } from '$lib/server/auth';
import { backfillNoteEncryption } from '$lib/server/notes-crypto';
import { purgeOldTrash } from '$lib/server/trash';
import { startLinkCheckScheduler } from '$lib/server/linkcheck';
import { startCurrencyScheduler } from '$lib/server/currency';

// Run migrations, encrypt legacy plaintext notes, and purge stale trash once,
// on the first request after boot; then start the link-rot scheduler.
let migrated: Promise<void> | null = null;
async function init() {
  await runMigrations();
  await backfillNoteEncryption();
  await purgeOldTrash();
  if (!building) {
    startLinkCheckScheduler();
    startCurrencyScheduler();
  }
}

const AUTH_PATHS = new Set(['/login', '/setup', '/register']);

export const handle: Handle = async ({ event, resolve }) => {
  if (!migrated) migrated = init();
  await migrated;

  // Resolve the session from the cookie.
  const token = event.cookies.get(sessionCookieName);
  const user = token ? await validateSession(token) : null;
  event.locals.user = user;
  event.locals.userId = user?.id ?? null;

  const path = event.url.pathname;
  const isApi = path.startsWith('/api');
  // Invite-redemption pages are reachable while logged out (like login/setup).
  const isAuthPage = AUTH_PATHS.has(path) || path.startsWith('/invite');

  if (!user && !isApi) {
    // No session: send to first-run setup if the instance has no admin yet,
    // otherwise to login. Auth pages themselves stay reachable.
    if (await needsSetup()) {
      if (path !== '/setup') throw redirect(303, '/setup');
    } else if (!isAuthPage) {
      throw redirect(303, '/login');
    }
  } else if (user && isAuthPage) {
    // Already signed in — no reason to see login/setup.
    throw redirect(303, '/');
  }

  // API routes enforce their own 401 via respond.handle(); pages are guarded above.
  return resolve(event);
};
