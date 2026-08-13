import { json } from '@sveltejs/kit';
import { MutationError } from './mutations';

/** Run a mutation and turn MutationError into a clean JSON error response. */
export async function handle<T>(userId: number | null, fn: (uid: number) => Promise<T>) {
  if (userId == null) return json({ error: 'Not signed in' }, { status: 401 });
  try {
    return json(await fn(userId));
  } catch (e) {
    if (e instanceof MutationError) return json({ error: e.message }, { status: e.status });
    console.error('[mutation] unexpected', e);
    return json({ error: 'Something went wrong' }, { status: 500 });
  }
}
