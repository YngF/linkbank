<script lang="ts">
  import Icon from './Icon.svelte';
  import Favicon from './Favicon.svelte';
  import { ui } from '$lib/client/ui.svelte';
  import { api } from '$lib/client/api';
  import { isNoteUrl } from '$lib/kind';
  import type { TreeNode, BookmarkWithTags } from '$lib/server/db/types';

  type Bookmark = BookmarkWithTags;
  interface Props {
    title: string;
    branchId: number | null;
    crumbs: { id: number; name: string }[];
    folders: TreeNode[];
    bookmarks: BookmarkWithTags[];
    listView?: boolean;
  }
  let { title, branchId, crumbs, folders, bookmarks, listView = false }: Props = $props();

  // Folders are hidden in the main pane by default (toggle in the topbar), but
  // force them on when the sidebar tree is collapsed to a drawer (narrow view),
  // so there's always a way to navigate folders.
  // The toggle is authoritative. Folders default to visible when the sidebar
  // collapses to a drawer (see the layout's breakpoint handler), but from then
  // on the show/hide button controls them — including on mobile.
  const effectiveShow = $derived(ui.showFolders);
  const shownFolders = $derived(effectiveShow ? folders : []);
  const nothingShown = $derived(shownFolders.length === 0 && bookmarks.length === 0);
  const foldersHidden = $derived(!effectiveShow && folders.length > 0);

  function newBookmark() {
    if (branchId != null) ui.openDialog({ kind: 'bookmark-new', branchId });
  }
  function newFolder() {
    if (branchId != null) ui.openDialog({ kind: 'folder-new', parentId: branchId });
  }

  const tagNames = (b: Bookmark) => (b.tags ?? []).map((t) => t.name);

  function openNote(b: Bookmark) {
    ui.openDialog({
      kind: 'note-view',
      id: b.id,
      title: b.title,
      notes: b.notes ?? '',
      url: b.url,
      branchId: b.branch_id,
      tags: tagNames(b)
    });
  }

  const editBookmark = (b: Bookmark) =>
    ui.openDialog({
      kind: 'bookmark-edit', id: b.id, title: b.title, url: b.url,
      notes: b.notes ?? '', branchId: b.branch_id, linkIgnore: !!b.link_ignore, tags: tagNames(b)
    });

  const confirmDelete = (b: Bookmark) =>
    ui.openDialog({
      kind: 'confirm',
      message: `Delete “${b.title}”?`,
      confirmLabel: 'Delete',
      run: () => api.deleteBookmark(b.id)
    });

  const moveDlg = (b: Bookmark) =>
    ui.openDialog({ kind: 'bulk-move', action: 'move', bookmarkIds: [b.id], branchIds: [] });
  const copyDlg = (b: Bookmark) =>
    ui.openDialog({ kind: 'bulk-move', action: 'copy', bookmarkIds: [b.id], branchIds: [] });

  function bookmarkMenu(e: MouseEvent, b: Bookmark) {
    e.preventDefault();
    if (isNoteUrl(b.url)) {
      ui.openMenu(e.clientX, e.clientY, [
        { label: 'View note', run: () => openNote(b) },
        { label: 'Edit…', run: () => editBookmark(b) },
        { label: 'Move to folder…', run: () => moveDlg(b) },
        { label: 'Copy to folder…', run: () => copyDlg(b) },
        { label: 'Delete', danger: true, run: () => confirmDelete(b) }
      ]);
      return;
    }
    ui.openMenu(e.clientX, e.clientY, [
      { label: 'Open', run: () => window.open(b.url, '_blank', 'noopener') },
      { label: 'Copy URL', run: () => navigator.clipboard?.writeText(b.url).then(() => ui.toast('URL copied')) },
      { label: 'Edit…', run: () => editBookmark(b) },
      { label: 'Move to folder…', run: () => moveDlg(b) },
      { label: 'Copy to folder…', run: () => copyDlg(b) },
      {
        label: b.link_ignore ? 'Include in link check' : 'Skip link check',
        run: () => api.setLinkIgnore(b.id, !b.link_ignore)
      },
      { label: 'Delete', danger: true, run: () => confirmDelete(b) }
    ]);
  }

  // ---- drag & drop ----------------------------------------------------------
  // dropHint drives the visual before/after/into indicators.
  let dropHint = $state<{ id: number; zone: 'before' | 'after' | 'into' } | null>(null);
  let urlDropActive = $state(false);

  function startBookmarkDrag(e: DragEvent, b: Bookmark) {
    ui.drag = { kind: 'bookmark', id: b.id };
    e.dataTransfer!.effectAllowed = 'move';
    e.dataTransfer!.setData('text/uri-list', b.url); // so it can also be dragged out
    e.dataTransfer!.setData('text/plain', b.url);
  }
  function endDrag() {
    ui.drag = null;
    dropHint = null;
  }

  function overBookmark(e: DragEvent, b: Bookmark) {
    if (ui.drag?.kind !== 'bookmark' || ui.drag.id === b.id) return;
    e.preventDefault();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const zone = e.clientX - r.left < r.width / 2 ? 'before' : 'after';
    dropHint = { id: b.id, zone };
  }
  function dropOnBookmark(e: DragEvent, b: Bookmark) {
    e.preventDefault();
    const hint = dropHint;
    dropHint = null;
    if (ui.drag?.kind !== 'bookmark' || branchId == null) return;
    const moved = ui.drag.id;
    const list = bookmarks.map((x) => x.id).filter((id) => id !== moved);
    const tIdx = list.indexOf(b.id);
    const at = hint?.zone === 'after' ? tIdx + 1 : tIdx;
    api.moveBookmark(moved, branchId, at);
  }

  function overFolderTile(e: DragEvent, f: TreeNode) {
    if (ui.drag?.kind === 'branch' && ui.drag.id === f.id) return;
    // accept bookmarks, folders, or an external URL
    if (ui.drag || e.dataTransfer?.types.includes('text/uri-list') || e.dataTransfer?.types.includes('text/plain')) {
      e.preventDefault();
      dropHint = { id: f.id, zone: 'into' };
    }
  }
  function dropOnFolderTile(e: DragEvent, f: TreeNode) {
    e.preventDefault();
    dropHint = null;
    if (ui.drag?.kind === 'bookmark') api.moveBookmark(ui.drag.id, f.id);
    else if (ui.drag?.kind === 'branch' && ui.drag.id !== f.id) api.moveFolder(ui.drag.id, f.id);
    else {
      const url = e.dataTransfer?.getData('text/uri-list') || e.dataTransfer?.getData('text/plain');
      if (url && /^https?:\/\//i.test(url)) api.dropUrl(f.id, url.split('\n')[0].trim());
    }
  }

  // External URL drop onto the pane background -> current folder.
  function overPane(e: DragEvent) {
    if (ui.drag) return; // internal drags handled by tiles
    const t = e.dataTransfer?.types;
    if (t?.includes('text/uri-list') || t?.includes('text/plain')) {
      e.preventDefault();
      urlDropActive = true;
    }
  }
  function dropOnPane(e: DragEvent) {
    urlDropActive = false;
    if (ui.drag || branchId == null) return;
    const url = e.dataTransfer?.getData('text/uri-list') || e.dataTransfer?.getData('text/plain');
    if (url && /^https?:\/\//i.test(url)) {
      e.preventDefault();
      api.dropUrl(branchId, url.split('\n')[0].trim());
    }
  }

  function folderMenu(e: MouseEvent, f: TreeNode) {
    e.preventDefault();
    ui.openMenu(e.clientX, e.clientY, [
      { label: 'Open', run: () => (location.href = `/f/${f.id}`) },
      { label: 'New subfolder…', run: () => ui.openDialog({ kind: 'folder-new', parentId: f.id }) },
      { label: 'Rename…', run: () => ui.openDialog({ kind: 'folder-rename', id: f.id, name: f.name }) },
      {
        label: 'Delete folder',
        danger: true,
        run: () =>
          ui.openDialog({
            kind: 'confirm',
            message: `Delete “${f.name}”? Only empty folders can be deleted.`,
            confirmLabel: 'Delete',
            run: () => api.deleteFolder(f.id)
          })
      }
    ]);
  }

  /** Short hostname for the tile's caption line. */
  function host(url: string): string {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return url;
    }
  }

  // ---- multi-select ---------------------------------------------------------
  // Combined visible order (folders then bookmarks) drives Shift-range selects.
  const order = $derived([
    ...shownFolders.map((f) => ({ kind: 'f' as const, id: f.id })),
    ...bookmarks.map((b) => ({ kind: 'b' as const, id: b.id }))
  ]);
  let anchor = $state<number | null>(null);

  // Clear the selection whenever we navigate to a different folder.
  $effect(() => {
    branchId;
    ui.clearSel();
    anchor = null;
  });

  const isSel = (kind: 'f' | 'b', id: number) =>
    kind === 'f' ? ui.selFolders.has(id) : ui.selBookmarks.has(id);
  function setSel(kind: 'f' | 'b', id: number, on: boolean) {
    const set = kind === 'f' ? ui.selFolders : ui.selBookmarks;
    if (on) set.add(id);
    else set.delete(id);
  }
  function selectRange(toIdx: number) {
    const from = anchor ?? toIdx;
    const [a, z] = from <= toIdx ? [from, toIdx] : [toIdx, from];
    for (let i = a; i <= z; i++) setSel(order[i].kind, order[i].id, true);
  }
  /** Returns true if the click was a selection gesture (caller should not navigate). */
  function selectClick(e: MouseEvent, kind: 'f' | 'b', id: number, idx: number): boolean {
    if (e.metaKey || e.ctrlKey) {
      e.preventDefault();
      setSel(kind, id, !isSel(kind, id));
      anchor = idx;
      return true;
    }
    if (e.shiftKey) {
      e.preventDefault();
      selectRange(idx);
      return true;
    }
    if (ui.selCount > 0) {
      // A plain click with an active selection clears it, then acts normally.
      ui.clearSel();
      anchor = null;
    }
    return false;
  }

  const selectedBookmarks = $derived(bookmarks.filter((b) => ui.selBookmarks.has(b.id)));
  // Union of tags across the selected bookmarks (for the bulk-tags dialog).
  const selectedTagUnion = $derived.by(() => {
    const seen = new Map<string, string>();
    for (const b of selectedBookmarks) for (const t of b.tags ?? []) seen.set(t.name.toLowerCase(), t.name);
    return [...seen.values()].sort((a, z) => a.localeCompare(z));
  });

  function bulkMove() {
    ui.openDialog({ kind: 'bulk-move', action: 'move', bookmarkIds: [...ui.selBookmarks], branchIds: [...ui.selFolders] });
  }
  function bulkCopyDlg() {
    ui.openDialog({ kind: 'bulk-move', action: 'copy', bookmarkIds: [...ui.selBookmarks], branchIds: [] });
  }
  function bulkTags() {
    ui.openDialog({ kind: 'bulk-tags', bookmarkIds: [...ui.selBookmarks], current: selectedTagUnion });
  }
  function bulkOpen() {
    // Open each in a new tab. Browsers cap how many tabs a single click may open
    // (Chrome is lenient; Firefox/Brave block everything after the first unless
    // pop-ups are allowed for this site). window.open returns null when blocked,
    // so we can tell the user exactly what happened and how to fix it.
    const urls = selectedBookmarks.filter((b) => !isNoteUrl(b.url)).map((b) => b.url);
    if (!urls.length) return;
    let opened = 0;
    for (const url of urls) {
      const w = window.open(url, '_blank');
      if (w) {
        try {
          w.opener = null; // sever reverse-tabnabbing without a popup-triggering feature string
        } catch {
          /* cross-origin: ignore */
        }
        opened++;
      }
    }
    if (opened < urls.length) {
      ui.toast(
        `Opened ${opened} of ${urls.length}. Your browser blocked the rest — allow pop-ups for this site to open them all.`,
        'error'
      );
    }
  }
  function bulkDelete() {
    const bIds = [...ui.selBookmarks];
    const fIds = [...ui.selFolders];
    ui.openDialog({
      kind: 'confirm',
      message: `Delete ${bIds.length + fIds.length} selected item(s)? Non-empty folders are kept.`,
      confirmLabel: 'Delete',
      run: () => {
        api.bulkDelete(bIds, fIds);
        ui.clearSel();
      }
    });
  }

  // ---- keyboard navigation --------------------------------------------------
  let gridEl = $state<HTMLDivElement | null>(null);
  let tileEls = $state<(HTMLElement | null)[]>([]);
  let focusIdx = $state(0);
  let typeahead = '';
  let typeaheadTimer: ReturnType<typeof setTimeout> | null = null;

  // Keep focusIdx in range as the list changes.
  $effect(() => {
    if (focusIdx > order.length - 1) focusIdx = Math.max(0, order.length - 1);
  });

  function focusTile(idx: number, extendSel = false) {
    idx = Math.max(0, Math.min(order.length - 1, idx));
    if (extendSel) {
      if (anchor == null) anchor = focusIdx;
      // Re-derive the range from the anchor each time so shrinking works.
      ui.clearSel();
      selectRange(idx);
    }
    focusIdx = idx;
    tileEls[idx]?.focus();
  }

  /** Number of columns currently rendered (for up/down movement). */
  function columns(): number {
    const els = gridEl?.querySelectorAll<HTMLElement>('.tile');
    if (!els || els.length === 0) return 1;
    const top0 = els[0].offsetTop;
    let c = 0;
    for (const el of els) {
      if (el.offsetTop === top0) c++;
      else break;
    }
    return Math.max(1, c);
  }

  function toggleFocused() {
    const it = order[focusIdx];
    if (it) {
      setSel(it.kind, it.id, !isSel(it.kind, it.id));
      anchor = focusIdx;
    }
  }

  function selectAll() {
    for (const it of order) setSel(it.kind, it.id, true);
  }

  function jumpTypeahead(ch: string) {
    typeahead += ch.toLowerCase();
    if (typeaheadTimer) clearTimeout(typeaheadTimer);
    typeaheadTimer = setTimeout(() => (typeahead = ''), 800);
    const label = (i: number) => {
      const it = order[i];
      if (!it) return '';
      return (it.kind === 'f' ? shownFolders.find((f) => f.id === it.id)?.name : bookmarks.find((b) => b.id === it.id)?.title) ?? '';
    };
    // Search from just after the current focus, wrapping around.
    for (let k = 1; k <= order.length; k++) {
      const i = (focusIdx + (typeahead.length > 1 ? 0 : k)) % order.length;
      if (label(i).toLowerCase().startsWith(typeahead)) {
        focusTile(i);
        return;
      }
    }
  }

  function isTyping(el: EventTarget | null) {
    const t = el as HTMLElement | null;
    return !!t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable);
  }

  function onGridKeydown(e: KeyboardEvent) {
    if (ui.dialog || isTyping(e.target)) return;
    const cols = columns();
    const k = e.key;
    if (k === 'Escape') { if (ui.selCount > 0) ui.clearSel(); return; }
    if (k === 'ArrowRight') { e.preventDefault(); focusTile(focusIdx + 1, e.shiftKey); }
    else if (k === 'ArrowLeft') { e.preventDefault(); focusTile(focusIdx - 1, e.shiftKey); }
    else if (k === 'ArrowDown') { e.preventDefault(); focusTile(focusIdx + cols, e.shiftKey); }
    else if (k === 'ArrowUp') { e.preventDefault(); focusTile(focusIdx - cols, e.shiftKey); }
    else if (k === 'Home') { e.preventDefault(); focusTile(0, e.shiftKey); }
    else if (k === 'End') { e.preventDefault(); focusTile(order.length - 1, e.shiftKey); }
    else if (k === ' ') { e.preventDefault(); toggleFocused(); }
    else if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === 'a') { e.preventDefault(); selectAll(); }
    else if (k === 'Delete' || k === 'Backspace') {
      if (ui.selCount > 0) { e.preventDefault(); bulkDelete(); }
    }
    else if (!e.ctrlKey && !e.metaKey && !e.altKey && k.length === 1) {
      // n / N create when not mid-typeahead; every other printable char jumps.
      if (typeahead === '' && (k === 'n' || k === 'N')) {
        e.preventDefault();
        if (branchId != null) (k === 'N' ? newFolder() : newBookmark());
      } else if (/\S/.test(k)) {
        e.preventDefault();
        jumpTypeahead(k);
      }
    }
  }

  // ---- marquee (drag-select) ------------------------------------------------
  let marquee = $state<{ x: number; y: number; w: number; h: number } | null>(null);
  let mqStart: { x: number; y: number; add: boolean } | null = null;
  const MQ_THRESHOLD = 5;

  function paneMouseDown(e: MouseEvent) {
    if (e.button !== 0) return;
    const t = e.target as HTMLElement;
    if (t.closest('.tile') || t.closest('.bulkbar') || t.closest('.page-head') || t.closest('.crumbs')) return;
    mqStart = { x: e.clientX, y: e.clientY, add: e.ctrlKey || e.metaKey };
    window.addEventListener('mousemove', paneMouseMove);
    window.addEventListener('mouseup', paneMouseUp);
  }
  function paneMouseMove(e: MouseEvent) {
    if (!mqStart) return;
    const dx = e.clientX - mqStart.x;
    const dy = e.clientY - mqStart.y;
    if (!marquee && Math.abs(dx) < MQ_THRESHOLD && Math.abs(dy) < MQ_THRESHOLD) return;
    const x = Math.min(mqStart.x, e.clientX);
    const y = Math.min(mqStart.y, e.clientY);
    marquee = { x, y, w: Math.abs(dx), h: Math.abs(dy) };
    applyMarquee(mqStart.add);
  }
  function paneMouseUp() {
    window.removeEventListener('mousemove', paneMouseMove);
    window.removeEventListener('mouseup', paneMouseUp);
    if (!marquee) {
      // A plain click on empty space clears the selection.
      if (mqStart && ui.selCount > 0) ui.clearSel();
    }
    marquee = null;
    mqStart = null;
  }
  function applyMarquee(add: boolean) {
    if (!marquee) return;
    const r = marquee;
    if (!add) ui.clearSel();
    const els = gridEl?.querySelectorAll<HTMLElement>('.tile') ?? [];
    els.forEach((el, i) => {
      const b = el.getBoundingClientRect();
      const hit = b.left < r.x + r.w && b.right > r.x && b.top < r.y + r.h && b.bottom > r.y;
      if (hit && order[i]) setSel(order[i].kind, order[i].id, true);
    });
  }
</script>

<svelte:window onkeydown={onGridKeydown} />

<div
  class="pane"
  role="region"
  aria-label="Folder contents"
  onmousedown={paneMouseDown}
  ondragover={overPane}
  ondragleave={() => (urlDropActive = false)}
  ondrop={dropOnPane}
>
<div class="main-inner" class:url-drop={urlDropActive}>
  <nav class="crumbs">
    {#each crumbs as c, i (c.id)}
      {#if i > 0}<span class="sep">›</span>{/if}
      <a href="/f/{c.id}">{c.name}</a>
    {/each}
  </nav>

  <div class="page-head">
    <h1>{title}</h1>
    <span class="sub">
      {bookmarks.length} bookmark{bookmarks.length === 1 ? '' : 's'}{#if folders.length}
        · {folders.length} folder{folders.length === 1 ? '' : 's'}{/if}
    </span>
    <span class="spacer"></span>
    {#if branchId != null}
      <button class="btn" onclick={newFolder}><Icon name="folder" size={14} /> Folder</button>
      <button class="btn primary" onclick={newBookmark}><Icon name="plus" size={14} /> Add bookmark</button>
    {/if}
  </div>

  {#if nothingShown}
    <div class="empty">
      <Icon name="link" size={34} />
      {#if foldersHidden}
        <div>No bookmarks here.</div>
        <div class="hint">{folders.length} sub-folder{folders.length === 1 ? '' : 's'} hidden — toggle them back on in the toolbar.</div>
      {:else}
        <div>This folder is empty.</div>
        {#if branchId != null}
          <button class="btn primary empty-add" onclick={newBookmark}><Icon name="plus" size={14} /> Add a bookmark</button>
        {/if}
      {/if}
    </div>
  {:else}
    <div class="grid" class:list={listView} bind:this={gridEl}>
      {#each shownFolders as f, i (f.id)}
        <a
          bind:this={tileEls[i]}
          tabindex={i === focusIdx ? 0 : -1}
          class="tile folder"
          class:dz-into={dropHint?.id === f.id && dropHint?.zone === 'into'}
          class:selected={isSel('f', f.id)}
          href="/f/{f.id}"
          data-ctx
          onclick={(e) => selectClick(e, 'f', f.id, i)}
          oncontextmenu={(e) => folderMenu(e, f)}
          ondragover={(e) => overFolderTile(e, f)}
          ondragleave={() => (dropHint = dropHint?.id === f.id ? null : dropHint)}
          ondrop={(e) => dropOnFolderTile(e, f)}
        >
          {#if isSel('f', f.id)}<span class="selcheck"><Icon name="check" size={12} /></span>{/if}
          <div class="ico folder-ico"><Icon name="folder" size={26} /></div>
          <div class="label">{f.name}</div>
          {#if f.count > 0}<div class="meta">{f.count} items</div>{/if}
        </a>
      {/each}
      {#each bookmarks as b, bi (b.id)}
        {#if isNoteUrl(b.url)}
          <button
            bind:this={tileEls[shownFolders.length + bi]}
            tabindex={shownFolders.length + bi === focusIdx ? 0 : -1}
            type="button"
            class="tile note"
            class:dz-before={dropHint?.id === b.id && dropHint?.zone === 'before'}
            class:dz-after={dropHint?.id === b.id && dropHint?.zone === 'after'}
            class:dragging={ui.drag?.kind === 'bookmark' && ui.drag.id === b.id}
            class:selected={isSel('b', b.id)}
            title={b.notes || 'Note'}
            draggable="true"
            data-ctx
            onclick={(e) => { if (!selectClick(e, 'b', b.id, shownFolders.length + bi)) openNote(b); }}
            oncontextmenu={(e) => bookmarkMenu(e, b)}
            ondragstart={(e) => startBookmarkDrag(e, b)}
            ondragend={endDrag}
            ondragover={(e) => overBookmark(e, b)}
            ondragleave={() => (dropHint = dropHint?.id === b.id ? null : dropHint)}
            ondrop={(e) => dropOnBookmark(e, b)}
          >
            {#if isSel('b', b.id)}<span class="selcheck"><Icon name="check" size={12} /></span>{/if}
            <div class="ico note-ico"><Icon name="note" size={24} /></div>
            <div class="label">{b.title}</div>
            <div class="meta">Note</div>
          </button>
        {:else}
          <a
            bind:this={tileEls[shownFolders.length + bi]}
            tabindex={shownFolders.length + bi === focusIdx ? 0 : -1}
            class="tile"
            class:dz-before={dropHint?.id === b.id && dropHint?.zone === 'before'}
            class:dz-after={dropHint?.id === b.id && dropHint?.zone === 'after'}
            class:dragging={ui.drag?.kind === 'bookmark' && ui.drag.id === b.id}
            class:selected={isSel('b', b.id)}
            href={b.url}
            target="_blank"
            rel="noopener noreferrer"
            title={b.notes ? `${b.url}\n\n${b.notes}` : b.url}
            draggable="true"
            data-ctx
            onclick={(e) => selectClick(e, 'b', b.id, shownFolders.length + bi)}
            oncontextmenu={(e) => bookmarkMenu(e, b)}
            ondragstart={(e) => startBookmarkDrag(e, b)}
            ondragend={endDrag}
            ondragover={(e) => overBookmark(e, b)}
            ondragleave={() => (dropHint = dropHint?.id === b.id ? null : dropHint)}
            ondrop={(e) => dropOnBookmark(e, b)}
          >
            {#if isSel('b', b.id)}<span class="selcheck"><Icon name="check" size={12} /></span>{/if}
            <Favicon url={b.url} title={b.title} />
            {#if b.link_status === 'broken' && !b.link_ignore}
              <span class="broken-badge" title={b.link_detail ?? 'This link appears to be broken'}>
                <Icon name="alert" size={11} />
              </span>
            {/if}
            <div class="label">{b.title}</div>
            <div class="meta">{host(b.url)}</div>
          </a>
        {/if}
      {/each}
    </div>
  {/if}
</div>
</div>

{#if marquee}
  <!-- Coords are true viewport px; this fixed box renders inside the zoomed
       <html>, so divide by the zoom to keep it under the pointer. -->
  <div
    class="marquee"
    style="left:calc({marquee.x}px / var(--ui-zoom, 1)); top:calc({marquee.y}px / var(--ui-zoom, 1)); width:calc({marquee.w}px / var(--ui-zoom, 1)); height:calc({marquee.h}px / var(--ui-zoom, 1))"
  ></div>
{/if}

{#if ui.selCount > 0}
  <div class="bulkbar" role="toolbar" aria-label="Bulk actions">
    <span class="count">{ui.selCount} selected</span>
    <button class="bbtn" onclick={bulkMove}><Icon name="folder" size={14} /> Move</button>
    {#if ui.selBookmarks.size > 0}
      <button class="bbtn" onclick={bulkCopyDlg}><Icon name="copy" size={14} /> Copy</button>
      <button class="bbtn" onclick={bulkTags}><Icon name="tag" size={14} /> Tags</button>
      <button class="bbtn" onclick={bulkOpen}><Icon name="link" size={14} /> Open all</button>
    {/if}
    <button class="bbtn danger" onclick={bulkDelete}><Icon name="trash" size={14} /> Delete</button>
    <button class="bbtn icon" onclick={() => ui.clearSel()} aria-label="Clear selection"><Icon name="x" size={15} /></button>
  </div>
{/if}

<style>
  .pane { min-height: 100%; width: 100%; }
  .main-inner { max-width: 1100px; margin: 0 auto; padding: 20px 26px 80px; }

  .crumbs { display: flex; align-items: center; gap: 4px; margin-bottom: 12px; font-size: 13px; }
  .crumbs a { color: var(--text-dim); padding: 3px 6px; border-radius: var(--r-sm); }
  .crumbs a:hover { background: var(--bg-hover); color: var(--text); }
  .crumbs a:last-of-type { color: var(--text); font-weight: 560; }
  .sep { color: var(--text-mute); opacity: 0.5; }

  .page-head { display: flex; align-items: baseline; gap: 12px; margin-bottom: 20px; }
  .page-head h1 { font-size: 22px; font-weight: 640; letter-spacing: -0.02em; }
  .sub { color: var(--text-mute); font-size: 12.5px; }
  .spacer { flex: 1; }

  .btn {
    display: inline-flex; align-items: center; gap: 6px; align-self: center;
    height: 30px; padding: 0 11px; border-radius: var(--r-md);
    font-size: 13px; font-weight: 520;
    border: 1px solid var(--line); background: var(--bg-raised); color: var(--text-dim);
  }
  .btn:hover { background: var(--bg-hover); color: var(--text); }
  .btn.primary { background: var(--accent); border-color: transparent; color: #fff; }
  .btn.primary:hover { filter: brightness(1.08); }
  .empty-add { margin-top: 14px; }

  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(116px, 1fr)); gap: 6px; }

  .tile {
    display: flex; flex-direction: column; align-items: center; text-align: center;
    gap: 9px; padding: 14px 8px 12px;
    border: 1px solid transparent; border-radius: var(--r-md);
    transition: background 0.1s, border-color 0.1s;
  }
  .tile:hover { background: var(--bg-panel); border-color: var(--line-soft); }

  .ico {
    width: 54px; height: 54px; border-radius: 13px;
    display: grid; place-items: center;
    font-size: 21px; font-weight: 680; color: #fff; letter-spacing: -0.02em;
    box-shadow: 0 1px 2px rgb(0 0 0 / 0.18), 0 6px 16px rgb(0 0 0 / 0.14);
  }
  .folder-ico { background: var(--bg-active); color: var(--text-dim); box-shadow: none; }

  /* note cards: a button styled to match the tile grid */
  button.tile {
    font: inherit; cursor: pointer; background: none;
    width: 100%; color: inherit;
  }
  .note-ico {
    background: linear-gradient(150deg, oklch(82% 0.11 90), oklch(74% 0.13 78));
    color: #fff;
  }
  :global([data-theme='dark']) .note-ico {
    background: linear-gradient(150deg, oklch(58% 0.09 90), oklch(50% 0.1 78));
  }

  /* broken-link warning badge, over the top-right of the favicon */
  .broken-badge {
    position: absolute; top: 8px; right: calc(50% - 34px);
    width: 18px; height: 18px; border-radius: 50%;
    display: grid; place-items: center;
    background: oklch(62% 0.2 25); color: #fff;
    box-shadow: 0 0 0 2px var(--bg), 0 1px 3px rgb(0 0 0 / 0.3);
  }

  /* list view (Settings → Bookmark view): compact rows instead of icon tiles,
     styled to match the tag view. Reuses the same tile markup/interactions
     (drag & drop, multi-select, keyboard nav) — only the layout changes. */
  .grid.list { display: flex; flex-direction: column; gap: 2px; }
  .grid.list .tile {
    flex-direction: row; align-items: center; text-align: left;
    padding: 7px 10px; gap: 10px; border-radius: var(--r-sm);
  }
  .grid.list .ico { width: 30px; height: 30px; border-radius: 8px; box-shadow: none; }
  .grid.list .ico :global(svg) { width: 16px; height: 16px; }
  .grid.list :global(.fav) { width: 30px; height: 30px; border-radius: 8px; box-shadow: none; }
  .grid.list :global(.fav img) { width: 17px; height: 17px; }
  .grid.list :global(.letter) { font-size: 12.5px; }
  .grid.list .label {
    flex: 1; min-width: 0; display: block;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .grid.list .meta { flex: none; max-width: 260px; margin-left: auto; padding-left: 10px; }
  .grid.list .selcheck { position: static; flex: none; }
  .grid.list .broken-badge { position: static; flex: none; box-shadow: none; }

  /* keyboard focus ring */
  .tile:focus { outline: none; }
  .tile:focus-visible, .tile:focus { box-shadow: 0 0 0 2px var(--bg), 0 0 0 4px var(--accent); border-radius: var(--r-md); }

  /* marquee (drag-select) */
  .marquee {
    position: fixed; z-index: 50; pointer-events: none;
    background: color-mix(in oklch, var(--accent) 18%, transparent);
    border: 1px solid var(--accent-line); border-radius: 4px;
  }

  /* selection */
  .tile.selected { background: var(--accent-soft); box-shadow: inset 0 0 0 1.5px var(--accent-line); border-color: transparent; }
  .selcheck {
    position: absolute; top: 7px; left: 7px; z-index: 2;
    width: 18px; height: 18px; border-radius: 50%;
    display: grid; place-items: center; background: var(--accent); color: #fff;
    box-shadow: 0 1px 3px rgb(0 0 0 / 0.3);
  }

  /* floating bulk-action bar */
  .bulkbar {
    position: fixed; left: 50%; bottom: 22px; transform: translateX(-50%);
    z-index: 55; display: flex; align-items: center; gap: 6px;
    padding: 8px 10px; border-radius: 999px;
    background: var(--bg-raised); border: 1px solid var(--line); box-shadow: var(--shadow);
    animation: pop 0.13s var(--ease);
  }
  @keyframes pop { from { opacity: 0; transform: translate(-50%, 8px); } }
  .bulkbar .count { font-size: 12.5px; font-weight: 560; color: var(--text-dim); padding: 0 6px; }
  .bbtn {
    display: inline-flex; align-items: center; gap: 6px;
    height: 30px; padding: 0 12px; border-radius: 999px;
    font-size: 13px; font-weight: 520; color: var(--text-dim); background: var(--bg-panel);
    border: 1px solid var(--line-soft);
  }
  .bbtn:hover { background: var(--bg-hover); color: var(--text); }
  .bbtn.icon { padding: 0 8px; }
  .bbtn.danger:hover {
    background: color-mix(in oklch, oklch(66% 0.19 22) 16%, transparent);
    color: oklch(60% 0.19 22); border-color: color-mix(in oklch, oklch(66% 0.19 22) 40%, transparent);
  }

  /* drag & drop affordances */
  .tile { position: relative; }
  .tile.dragging { opacity: 0.4; }
  .tile.dz-into { background: var(--accent-soft); box-shadow: inset 0 0 0 1.5px var(--accent-line); border-color: transparent; }
  .tile.dz-before::before, .tile.dz-after::after {
    content: ''; position: absolute; top: 12px; bottom: 22px; width: 3px;
    background: var(--accent); border-radius: 2px;
  }
  .tile.dz-before::before { left: -4px; }
  .tile.dz-after::after { right: -4px; }
  .main-inner.url-drop { outline: 2px dashed var(--accent-line); outline-offset: -8px; border-radius: var(--r-lg); }

  .label {
    font-size: 12px; font-weight: 520; line-height: 1.35;
    display: -webkit-box; -webkit-line-clamp: 3; line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;
  }
  .meta {
    font-size: 10.5px; color: var(--text-mute);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%;
  }

  .empty {
    text-align: center; padding: 70px 20px; color: var(--text-mute);
    border: 1.5px dashed var(--line); border-radius: var(--r-lg);
  }
  .empty :global(svg) { opacity: 0.4; margin-bottom: 12px; }
  .hint { font-size: 12px; margin-top: 5px; }
</style>
