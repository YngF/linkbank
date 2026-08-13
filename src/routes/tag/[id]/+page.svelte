<script lang="ts">
  import Icon from '$lib/components/Icon.svelte';
  import Favicon from '$lib/components/Favicon.svelte';
  import TagChip from '$lib/components/TagChip.svelte';
  import { ui } from '$lib/client/ui.svelte';
  import { api } from '$lib/client/api';
  import { isNoteUrl } from '$lib/kind';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  function host(u: string) {
    try {
      return new URL(u).hostname.replace(/^www\./, '');
    } catch {
      return u;
    }
  }

  async function openBookmark(b: PageData['bookmarks'][number]) {
    // Fetch full record (notes, tags, linkIgnore) then open the editor / note.
    let full: any = null;
    try {
      const res = await fetch(`/api/bookmarks/${b.id}`);
      full = await res.json();
      if (!res.ok) full = null;
    } catch {
      full = null;
    }
    if (isNoteUrl(b.url)) {
      ui.openDialog({
        kind: 'note-view', id: b.id, title: b.title, notes: full?.notes ?? '', url: b.url, branchId: b.branch_id,
        tags: (full?.tags ?? []).map((t: { name: string }) => t.name)
      });
    } else {
      window.open(b.url, '_blank', 'noopener');
    }
  }

  async function edit(b: PageData['bookmarks'][number]) {
    try {
      const res = await fetch(`/api/bookmarks/${b.id}`);
      const f = await res.json();
      if (!res.ok) return;
      ui.openDialog({
        kind: 'bookmark-edit',
        id: f.id,
        title: f.title,
        url: f.url,
        notes: f.notes ?? '',
        branchId: f.branchId,
        linkIgnore: !!f.linkIgnore,
        tags: (f.tags ?? []).map((t: { name: string }) => t.name)
      });
    } catch {
      /* ignore */
    }
  }

  function del(b: PageData['bookmarks'][number]) {
    ui.openDialog({
      kind: 'confirm',
      message: `Delete “${b.title}”?`,
      confirmLabel: 'Delete',
      run: () => api.deleteBookmark(b.id)
    });
  }

  const editTag = () => {
    if (data.tag) ui.openDialog({ kind: 'tag-edit', id: data.tag.id, name: data.tag.name, hue: data.tag.hue });
  };
</script>

<div class="main-inner">
  {#if data.tag}
    <div class="page-head">
      <TagChip name={data.tag.name} hue={data.tag.hue} />
      <span class="sub">{data.bookmarks.length} bookmark{data.bookmarks.length === 1 ? '' : 's'}</span>
      <span class="spacer"></span>
      <button class="btn" onclick={editTag}><Icon name="tag" size={14} /> Edit tag</button>
    </div>

    {#if data.bookmarks.length === 0}
      <div class="empty">
        <Icon name="tag" size={34} />
        <div>No bookmarks with this tag.</div>
        <div class="hint">Add the tag to a bookmark from its edit dialog.</div>
      </div>
    {:else}
      <div class="list">
        {#each data.bookmarks as b (b.id)}
          <div class="row">
            {#if isNoteUrl(b.url)}
              <span class="noteico"><Icon name="note" size={16} /></span>
            {:else}
              <Favicon url={b.url} title={b.title} />
            {/if}
            <button class="body" onclick={() => openBookmark(b)}>
              <div class="title">{b.title}</div>
              <div class="meta">{isNoteUrl(b.url) ? 'Note' : b.url}{#if b.path} · in {b.path}{/if}</div>
            </button>
            <a class="btn" href="/f/{b.branch_id}" title="Go to the folder">Folder</a>
            <button class="btn" onclick={() => edit(b)} title="Edit bookmark">Edit</button>
            <button class="btn" onclick={() => api.removeTagFromBookmark(data.tag.id, b.id)} title="Remove this tag from the bookmark">
              <Icon name="x" size={14} />
            </button>
            <button class="btn danger" onclick={() => del(b)} title="Delete bookmark"><Icon name="trash" size={14} /></button>
          </div>
        {/each}
      </div>
    {/if}
  {/if}
</div>

<style>
  .main-inner { max-width: 900px; margin: 0 auto; padding: 20px 26px 80px; }
  .page-head { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
  .sub { color: var(--text-mute); font-size: 12.5px; }
  .spacer { flex: 1; }

  .btn {
    display: inline-flex; align-items: center; gap: 6px; align-self: center;
    height: 30px; padding: 0 11px; border-radius: var(--r-md);
    font-size: 13px; font-weight: 520; flex: none;
    border: 1px solid var(--line); background: var(--bg-raised); color: var(--text-dim);
  }
  .btn:hover { background: var(--bg-hover); color: var(--text); }
  .btn.danger:hover {
    background: color-mix(in oklch, oklch(66% 0.19 22) 16%, transparent);
    color: oklch(60% 0.19 22); border-color: color-mix(in oklch, oklch(66% 0.19 22) 40%, transparent);
  }

  .list { display: flex; flex-direction: column; gap: 4px; }
  .row {
    display: flex; align-items: center; gap: 12px;
    padding: 9px 12px; border-radius: var(--r-md); border: 1px solid var(--line-soft);
  }
  .row:hover { background: var(--bg-panel); }
  .row :global(.fav) { width: 34px; height: 34px; border-radius: 9px; flex: none; }
  .row :global(.fav img) { width: 20px; height: 20px; }
  .noteico {
    width: 34px; height: 34px; border-radius: 9px; flex: none; display: grid; place-items: center;
    background: var(--bg-active); color: var(--text-dim);
  }
  .body { flex: 1; min-width: 0; text-align: left; background: none; }
  .title { font-size: 13.5px; font-weight: 545; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text); }
  .body:hover .title { color: var(--accent); }
  .meta { font-size: 11.5px; color: var(--text-mute); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .empty {
    text-align: center; padding: 70px 20px; color: var(--text-mute);
    border: 1.5px dashed var(--line); border-radius: var(--r-lg);
  }
  .empty :global(svg) { opacity: 0.4; margin-bottom: 12px; }
  .hint { font-size: 12px; margin-top: 5px; }
</style>
