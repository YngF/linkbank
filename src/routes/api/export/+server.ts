import type { RequestHandler } from './$types';
import { exportHtml } from '$lib/server/netscape';

export const GET: RequestHandler = async ({ locals }) => {
  if (locals.userId == null) return new Response('Not signed in', { status: 401 });
  const html = await exportHtml(locals.userId);
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'content-disposition': `attachment; filename="linkbank-export-${stamp}.html"`
    }
  });
};
