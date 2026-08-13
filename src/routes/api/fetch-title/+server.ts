import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * Fetch a page's <title> for the add-bookmark flow (replaces getTitle.php).
 * Best-effort: on any failure it returns an empty title so the UI just leaves
 * the field for the user to fill in.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  if (locals.userId == null) return json({ error: 'Not signed in' }, { status: 401 });
  const { url } = await request.json();
  if (!/^https?:\/\//i.test(url ?? '')) return json({ title: '' });

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'user-agent': 'LinkBank/0.1 (+title-fetch)' },
      redirect: 'follow'
    });
    clearTimeout(timer);
    const html = (await res.text()).slice(0, 200_000); // cap: title is near the top
    const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    let title = m ? m[1].replace(/\s+/g, ' ').trim() : '';
    // decode the handful of entities that actually show up in titles
    title = title
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ');
    return json({ title });
  } catch {
    return json({ title: '' });
  }
};
