import type { PageServerLoad } from './$types';
import { saveToInbox } from '$lib/server/ingest';

// The PWA share target lands here (GET /share?url=&title=&text=). We save the
// shared link straight to the user's Inbox and show a confirmation.
export const load: PageServerLoad = async ({ url, locals }) => {
  if (locals.userId == null) return { status: 'unauth' as const };

  const shared = {
    url: url.searchParams.get('url'),
    title: url.searchParams.get('title'),
    text: url.searchParams.get('text')
  };
  if (!shared.url && !shared.text && !shared.title) return { status: 'empty' as const };

  try {
    const r = await saveToInbox(locals.userId, shared);
    return { status: 'saved' as const, title: shared.title ?? r.url, savedUrl: r.url, folder: r.folder };
  } catch (e) {
    return { status: 'error' as const, error: e instanceof Error ? e.message : 'Failed to save' };
  }
};
