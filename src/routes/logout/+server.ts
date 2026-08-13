import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { deleteSession, clearSessionCookie, sessionCookieName } from '$lib/server/auth';

export const POST: RequestHandler = async ({ cookies }) => {
  const token = cookies.get(sessionCookieName);
  if (token) await deleteSession(token);
  clearSessionCookie(cookies);
  throw redirect(303, '/login');
};
