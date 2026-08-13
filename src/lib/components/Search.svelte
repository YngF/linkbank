<script lang="ts">
  import { goto } from '$app/navigation';
  import Icon from './Icon.svelte';
  import { ui } from '$lib/client/ui.svelte';
  import { isNoteUrl } from '$lib/kind';
  import { dotStyle } from '$lib/tagcolour';

  interface FolderHit { id: number; name: string; path: string }
  interface BookmarkHit { id: number; title: string; url: string; branchId: number; path: string }
  interface TagHit { id: number; name: string; hue: number; count?: number }
  type Flat =
    | { type: 'folder'; hit: FolderHit }
    | { type: 'tag'; hit: TagHit }
    | { type: 'bookmark'; hit: BookmarkHit };

  let q = $state('');
  let folders = $state<FolderHit[]>([]);
  let bookmarks = $state<BookmarkHit[]>([]);
  let tags = $state<TagHit[]>([]);
  let open = $state(false);
  let active = $state(0);
  let input = $state<HTMLInputElement | null>(null);

  let timer: ReturnType<typeof setTimeout> | null = null;
  let controller: AbortController | null = null;

  const flat = $derived<Flat[]>([
    ...folders.map((hit) => ({ type: 'folder' as const, hit })),
    ...tags.map((hit) => ({ type: 'tag' as const, hit })),
    ...bookmarks.map((hit) => ({ type: 'bookmark' as const, hit }))
  ]);

  function host(u: string) {
    try {
      return new URL(u).hostname.replace(/^www\./, '');
    } catch {
      return u;
    }
  }

  function runSearch(value: string) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(async () => {
      const term = value.trim();
      if (!term) {
        folders = [];
        bookmarks = [];
        tags = [];
        open = false;
        return;
      }
      controller?.abort();
      controller = new AbortController();
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`, {
          signal: controller.signal
        });
        const data = await res.json();
        folders = data.folders ?? [];
        bookmarks = data.bookmarks ?? [];
        tags = data.tags ?? [];
        active = 0;
        open = true;
      } catch (e) {
        if ((e as Error).name !== 'AbortError') { folders = []; bookmarks = []; tags = []; }
      }
    }, 140);
  }

  async function choose(item: Flat) {
    close();
    if (item.type === 'folder') {
      goto(`/f/${item.hit.id}`);
      return;
    }
    if (item.type === 'tag') {
      goto(`/tag/${item.hit.id}`);
      return;
    }
    // Note/memo cards aren't real links — open the note instead of navigating.
    if (isNoteUrl(item.hit.url)) {
      try {
        const res = await fetch(`/api/bookmarks/${item.hit.id}`);
        const b = await res.json();
        if (res.ok) {
          ui.openDialog({
            kind: 'note-view',
            id: b.id,
            title: b.title,
            notes: b.notes ?? '',
            url: b.url,
            branchId: b.branchId,
            tags: (b.tags ?? []).map((t: { name: string }) => t.name)
          });
          return;
        }
      } catch {
        /* fall through to folder navigation */
      }
      goto(`/f/${item.hit.branchId}`);
      return;
    }
    window.open(item.hit.url, '_blank', 'noopener');
  }

  function close() {
    open = false;
    q = '';
    folders = [];
    bookmarks = [];
    input?.blur();
  }

  function onKey(e: KeyboardEvent) {
    if (!open || flat.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); active = (active + 1) % flat.length; }
    else if (e.key === 'ArrowUp') { e.preventDefault(); active = (active - 1 + flat.length) % flat.length; }
    else if (e.key === 'Enter') { e.preventDefault(); choose(flat[active]); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
  }

  // Global: "/" focuses search, Cmd/Ctrl-K too.
  function onGlobalKey(e: KeyboardEvent) {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement)?.tagName ?? '');
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      input?.focus();
    } else if (e.key === '/' && !typing) {
      e.preventDefault();
      input?.focus();
    }
  }
</script>

<svelte:window
  onkeydown={onGlobalKey}
  onclick={(e) => { if (!(e.target as HTMLElement).closest('.search-wrap')) open = false; }}
/>

<div class="search-wrap">
  <div class="search" class:active={open}>
    <Icon name="search" size={14} />
    <input
      bind:this={input}
      bind:value={q}
      placeholder="Search bookmarks & folders…"
      autocomplete="off"
      spellcheck="false"
      oninput={() => runSearch(q)}
      onfocus={() => { if (flat.length) open = true; }}
      onkeydown={onKey}
    />
    <kbd>/</kbd>
  </div>

  {#if open && q.trim()}
    <div class="results" role="listbox">
      {#if flat.length === 0}
        <div class="none">No matches for “{q.trim()}”.</div>
      {:else}
        {#each flat as item, i (item.type + item.hit.id)}
          {#if i === 0 || flat[i - 1].type !== item.type}
            <div class="group">{item.type === 'folder' ? 'Folders' : item.type === 'tag' ? 'Tags' : 'Bookmarks'}</div>
          {/if}
          <button
            class="res"
            class:cur={i === active}
            role="option"
            aria-selected={i === active}
            onmouseenter={() => (active = i)}
            onclick={() => choose(item)}
          >
            <span class="ri">
              {#if item.type === 'tag'}
                <span class="tagdot" style={dotStyle(item.hit.hue)}></span>
              {:else}
                <Icon name={item.type === 'folder' ? 'folder' : 'link'} size={14} />
              {/if}
            </span>
            <span class="rt">{item.type === 'bookmark' ? item.hit.title : item.hit.name}</span>
            <span class="rp">
              {#if item.type === 'folder'}{item.hit.path}
              {:else if item.type === 'tag'}{item.hit.count ?? ''} item{item.hit.count === 1 ? '' : 's'}
              {:else}{item.hit.path || host(item.hit.url)}{/if}
            </span>
          </button>
        {/each}
      {/if}
    </div>
  {/if}
</div>

<style>
  .search-wrap { margin-left: auto; position: relative; }
  .search {
    display: flex; align-items: center; gap: 7px;
    background: var(--bg); border: 1px solid var(--line);
    border-radius: var(--r-md); padding: 0 9px; height: 30px;
    width: 260px; color: var(--text-mute);
    transition: width 0.16s var(--ease), border-color 0.12s;
  }
  .search.active, .search:focus-within { border-color: var(--accent-line); width: 340px; }
  .search input { background: none; border: 0; outline: 0; width: 100%; font-size: 13px; color: var(--text); }
  .search input::placeholder { color: var(--text-mute); }
  kbd {
    font-size: 10.5px; color: var(--text-mute);
    border: 1px solid var(--line); border-bottom-width: 2px;
    border-radius: 5px; padding: 0 5px; background: var(--bg-raised); flex: none;
  }

  .results {
    position: absolute; top: 38px; right: 0; width: 340px; max-height: 60vh; overflow: auto;
    background: var(--bg-raised); border: 1px solid var(--line);
    border-radius: var(--r-md); box-shadow: var(--shadow); padding: 5px; z-index: 65;
    animation: pop 0.1s var(--ease);
  }
  @keyframes pop { from { opacity: 0; transform: translateY(-4px); } }
  .group {
    font-size: 10px; text-transform: uppercase; letter-spacing: 0.07em;
    color: var(--text-mute); font-weight: 700; padding: 7px 9px 3px;
  }
  .none { padding: 14px 10px; font-size: 13px; color: var(--text-mute); text-align: center; }
  .res {
    display: flex; align-items: center; gap: 9px; width: 100%;
    padding: 7px 9px; border-radius: var(--r-sm); text-align: left;
  }
  .res.cur { background: var(--accent-soft); }
  .ri { color: var(--text-mute); flex: none; display: grid; place-items: center; width: 16px; }
  .tagdot { width: 10px; height: 10px; border-radius: 50%; }
  .res.cur .ri { color: var(--accent); }
  .rt { font-size: 13.5px; color: var(--text); flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .rp { font-size: 11px; color: var(--text-mute); flex: none; max-width: 45%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  @media (max-width: 860px) {
    .search { width: 150px; }
    .search.active, .search:focus-within { width: 190px; }
    .results { width: 260px; }
  }
</style>
