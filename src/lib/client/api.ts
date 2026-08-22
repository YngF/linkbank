import { invalidateAll, goto } from '$app/navigation';
import { ui } from './ui.svelte';

async function call(method: string, url: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data;
}

/** Run a mutation, refresh loaded data, toast the outcome. */
async function mutate<T>(fn: () => Promise<T>, ok: string): Promise<T | null> {
  try {
    const r = await fn();
    await invalidateAll();
    ui.toast(ok);
    return r;
  } catch (e) {
    ui.toast(e instanceof Error ? e.message : 'Something went wrong', 'error');
    return null;
  }
}

export const api = {
  fetchTitle: (url: string) =>
    call('POST', '/api/fetch-title', { url }).then((d) => d.title as string).catch(() => ''),

  createBookmark: (branchId: number, url: string, title?: string, notes?: string, tags?: string[]) =>
    mutate(() => call('POST', '/api/bookmarks', { branchId, url, title, notes, tags }), 'Bookmark added'),

  updateBookmark: (
    id: number,
    patch: { title?: string; url?: string; notes?: string; branchId?: number; linkIgnore?: boolean; tags?: string[] }
  ) => mutate(() => call('PATCH', `/api/bookmarks/${id}`, patch), 'Saved'),

  // ---- tags -----------------------------------------------------------------
  updateTag: (id: number, patch: { name?: string; hue?: number | null }) =>
    mutate(() => call('PATCH', `/api/tags/${id}`, patch), 'Tag updated'),
  deleteTag: (id: number) => mutate(() => call('DELETE', `/api/tags/${id}`), 'Tag deleted'),
  removeTagFromBookmark: (tagId: number, bookmarkId: number) =>
    mutate(() => call('DELETE', `/api/tags/${tagId}/bookmarks/${bookmarkId}`), 'Tag removed'),

  // ---- bulk operations ------------------------------------------------------
  bulkMove: (bookmarkIds: number[], branchIds: number[], toBranchId: number) =>
    mutate(
      () => call('POST', '/api/bulk/move', { bookmarkIds, branchIds, toBranchId }),
      'Moved'
    ).then((r) => {
      const res = r as { moved: number; skipped: number } | null;
      if (res && res.skipped) ui.toast(`${res.skipped} item(s) couldn’t be moved`, 'error');
      return res;
    }),

  bulkTags: (bookmarkIds: number[], add: string[], remove: string[]) =>
    mutate(() => call('POST', '/api/bulk/tags', { bookmarkIds, add, remove }), 'Tags updated'),

  bulkCopy: (bookmarkIds: number[], toBranchId: number) =>
    mutate(() => call('POST', '/api/bulk/copy', { bookmarkIds, toBranchId }), 'Copied'),

  bulkDelete: async (bookmarkIds: number[], branchIds: number[]) => {
    try {
      const r = (await call('POST', '/api/bulk/delete', { bookmarkIds, branchIds })) as {
        deletedBookmarks: number[];
        deletedBranches: number[];
        skippedFolders: number;
      };
      await invalidateAll();
      const n = r.deletedBookmarks.length + r.deletedBranches.length;
      const msg = r.skippedFolders
        ? `Deleted ${n}; ${r.skippedFolders} non-empty folder(s) kept`
        : `Deleted ${n} item${n === 1 ? '' : 's'}`;
      ui.toast(msg, 'ok', {
        label: 'Undo',
        run: () =>
          mutate(
            () =>
              call('POST', '/api/bulk/restore', {
                bookmarkIds: r.deletedBookmarks,
                branchIds: r.deletedBranches
              }),
            'Restored'
          )
      });
      return r;
    } catch (e) {
      ui.toast(e instanceof Error ? e.message : 'Delete failed', 'error');
      return null;
    }
  },

  deleteBookmark: async (id: number) => {
    try {
      await call('DELETE', `/api/bookmarks/${id}`);
      await invalidateAll();
      ui.toast('Bookmark deleted', 'ok', { label: 'Undo', run: () => api.restoreBookmark(id) });
    } catch (e) {
      ui.toast(e instanceof Error ? e.message : 'Delete failed', 'error');
    }
  },
  restoreBookmark: (id: number) =>
    mutate(() => call('POST', `/api/bookmarks/${id}/restore`), 'Bookmark restored'),
  purgeBookmark: (id: number) =>
    mutate(() => call('DELETE', `/api/bookmarks/${id}?hard=1`), 'Permanently deleted'),

  createFolder: (parentId: number, name: string) =>
    mutate(() => call('POST', '/api/branches', { parentId, name }), 'Folder created'),

  renameFolder: (id: number, name: string) =>
    mutate(() => call('PATCH', `/api/branches/${id}`, { name }), 'Folder renamed'),

  deleteFolder: async (id: number, thenGoto?: string) => {
    try {
      await call('DELETE', `/api/branches/${id}`);
      if (thenGoto) await goto(thenGoto);
      await invalidateAll();
      ui.toast('Folder deleted', 'ok', { label: 'Undo', run: () => api.restoreFolder(id) });
    } catch (e) {
      ui.toast(e instanceof Error ? e.message : 'Delete failed', 'error');
    }
  },
  restoreFolder: (id: number) =>
    mutate(() => call('POST', `/api/branches/${id}/restore`), 'Folder restored'),
  purgeFolder: (id: number) =>
    mutate(() => call('DELETE', `/api/branches/${id}?hard=1`), 'Permanently deleted'),
  emptyTrash: () => mutate(() => call('POST', '/api/trash/empty'), 'Trash emptied'),

  moveBookmark: (id: number, toBranchId: number, index?: number) =>
    mutate(() => call('POST', `/api/bookmarks/${id}/move`, { toBranchId, index }), 'Moved'),

  moveFolder: (id: number, toParentId: number, index?: number) =>
    mutate(() => call('POST', `/api/branches/${id}/move`, { toParentId, index }), 'Moved'),

  // Upload a custom favicon for a bookmark's host (for sites with a bad/missing one).
  uploadFavicon: async (url: string, file: File) => {
    try {
      const res = await fetch(`/favicon?u=${encodeURIComponent(url)}`, {
        method: 'POST',
        headers: { 'content-type': file.type || 'application/octet-stream' },
        body: file
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Upload failed');
      ui.faviconVersion++; // force tiles + preview to reload the new icon
      ui.toast('Custom icon saved');
      return true;
    } catch (e) {
      ui.toast(e instanceof Error ? e.message : 'Upload failed', 'error');
      return false;
    }
  },
  resetFavicon: async (url: string) => {
    try {
      await fetch(`/favicon?u=${encodeURIComponent(url)}`, { method: 'DELETE' });
      ui.faviconVersion++;
      ui.toast('Icon reset to automatic');
    } catch {
      ui.toast('Reset failed', 'error');
    }
  },

  // Import a Netscape bookmark HTML file's contents into a new folder.
  importHtml: (html: string) =>
    mutate(async () => {
      const r = await call('POST', '/api/import', { html });
      return r as { folders: number; bookmarks: number; into: string };
    }, 'Import complete').then((r) => {
      if (r) ui.toast(`Imported ${r.bookmarks} bookmarks into “${r.into}”`);
      return r;
    }),

  // ---- admin ----------------------------------------------------------------
  setUserAdmin: (id: number, isAdmin: boolean) =>
    mutate(() => call('PATCH', `/api/admin/users/${id}`, { isAdmin }), isAdmin ? 'Granted admin' : 'Revoked admin'),
  deleteUser: (id: number) => mutate(() => call('DELETE', `/api/admin/users/${id}`), 'User deleted'),
  createInvite: (opts: { email?: string; note?: string; isAdmin?: boolean; expiresInDays?: number }) =>
    call('POST', '/api/admin/invites', opts) as Promise<{ link: string; id: number }>,
  revokeInvite: (id: number) => mutate(() => call('DELETE', `/api/admin/invites/${id}`), 'Invite revoked'),

  // ---- modules (admin) ------------------------------------------------------
  setModule: (id: string, enabled: boolean) =>
    mutate(() => call('PATCH', '/api/admin/modules', { id, enabled }), enabled ? 'Module installed' : 'Module uninstalled'),
  refreshRates: () =>
    mutate(() => call('POST', '/api/admin/modules', { action: 'refresh-rates' }), 'Exchange rates refreshed'),

  // ---- link-rot checking ----------------------------------------------------
  // Start a full sweep of the current user's bookmarks (runs in the background).
  checkLinks: () => call('POST', '/api/links/check', {}),
  // Poll sweep progress.
  linkStatus: () =>
    call('GET', '/api/links/status') as Promise<{
      running: boolean;
      total: number;
      done: number;
      broken: number;
    }>,
  // Re-check one bookmark; refresh the view so its badge updates.
  recheckLink: (id: number) =>
    mutate(
      () => call('POST', '/api/links/check', { id }),
      'Re-checked'
    ) as Promise<{ ok: boolean; detail: string } | null>,
  // Exempt / re-include a bookmark in link-rot checking.
  setLinkIgnore: (id: number, ignore: boolean) =>
    mutate(
      () => call('PATCH', `/api/bookmarks/${id}`, { linkIgnore: ignore }),
      ignore ? 'Excluded from link check' : 'Included in link check'
    ),

  // Drop a URL (from the address bar) into a folder: fetch its title, then create.
  dropUrl: async (branchId: number, url: string) => {
    const title = await api.fetchTitle(url).catch(() => '');
    return mutate(
      () => call('POST', '/api/bookmarks', { branchId, url, title }),
      'Bookmark added'
    );
  }
};
