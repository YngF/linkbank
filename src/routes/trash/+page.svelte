<script lang="ts">
  import Icon from '$lib/components/Icon.svelte';
  import { ui } from '$lib/client/ui.svelte';
  import { api } from '$lib/client/api';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  function ago(iso: string | null): string {
    if (!iso) return '';
    const then = new Date(iso.replace(' ', 'T') + 'Z').getTime();
    const s = Math.max(0, (Date.now() - then) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
  }

  const restore = (it: PageData['items'][number]) =>
    it.kind === 'folder' ? api.restoreFolder(it.id) : api.restoreBookmark(it.id);

  function purge(it: PageData['items'][number]) {
    ui.openDialog({
      kind: 'confirm',
      message: `Permanently delete “${it.title}”? This cannot be undone.`,
      confirmLabel: 'Delete forever',
      run: () => (it.kind === 'folder' ? api.purgeFolder(it.id) : api.purgeBookmark(it.id))
    });
  }
  function empty() {
    ui.openDialog({
      kind: 'confirm',
      message: `Permanently delete all ${data.items.length} item(s) in the trash? This cannot be undone.`,
      confirmLabel: 'Empty trash',
      run: () => api.emptyTrash()
    });
  }
</script>

<div class="main-inner">
  <div class="page-head">
    <h1>Trash</h1>
    <span class="sub">{data.items.length} item{data.items.length === 1 ? '' : 's'} · auto-deleted after 30 days</span>
    <span class="spacer"></span>
    {#if data.items.length}
      <button class="btn danger" onclick={empty}>Empty trash</button>
    {/if}
  </div>

  {#if data.items.length === 0}
    <div class="empty">
      <Icon name="trash" size={34} />
      <div>Trash is empty.</div>
      <div class="hint">Deleted bookmarks and folders show up here.</div>
    </div>
  {:else}
    <div class="list">
      {#each data.items as it (it.kind + it.id)}
        <div class="row">
          <span class="ico"><Icon name={it.kind === 'folder' ? 'folder' : 'link'} size={15} /></span>
          <div class="body">
            <div class="title">{it.title}</div>
            <div class="meta">
              {it.kind === 'folder' ? 'Folder' : it.url}{#if it.path} · in {it.path}{/if} · {ago(it.deleted_at)}
            </div>
          </div>
          <button class="btn" onclick={() => restore(it)}>Restore</button>
          <button class="btn danger" onclick={() => purge(it)} title="Delete permanently">
            <Icon name="trash" size={14} />
          </button>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .main-inner { max-width: 900px; margin: 0 auto; padding: 20px 26px 80px; }
  .page-head { display: flex; align-items: baseline; gap: 12px; margin-bottom: 20px; }
  h1 { font-size: 22px; font-weight: 640; letter-spacing: -0.02em; }
  .sub { color: var(--text-mute); font-size: 12.5px; }
  .spacer { flex: 1; }

  .list { display: flex; flex-direction: column; gap: 4px; }
  .row {
    display: flex; align-items: center; gap: 11px;
    padding: 9px 11px; border-radius: var(--r-md); border: 1px solid var(--line-soft);
  }
  .row:hover { background: var(--bg-panel); }
  .ico { color: var(--text-mute); flex: none; display: grid; place-items: center; }
  .body { flex: 1; min-width: 0; }
  .title { font-size: 13.5px; font-weight: 545; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .meta { font-size: 11.5px; color: var(--text-mute); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

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

  .empty {
    text-align: center; padding: 70px 20px; color: var(--text-mute);
    border: 1.5px dashed var(--line); border-radius: var(--r-lg);
  }
  .empty :global(svg) { opacity: 0.4; margin-bottom: 12px; }
  .hint { font-size: 12px; margin-top: 5px; }
</style>
