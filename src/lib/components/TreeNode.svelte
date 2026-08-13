<script lang="ts">
  import type { TreeNode } from '$lib/server/db/types';
  import Icon from './Icon.svelte';
  import Self from './TreeNode.svelte';
  import { ui, type MenuItem } from '$lib/client/ui.svelte';
  import { api } from '$lib/client/api';

  interface Props {
    node: TreeNode;
    depth?: number;
    currentId: number | null;
    openIds?: Set<number>;
    parentId?: number | null; // this node's parent (for drag-reorder)
    siblings?: TreeNode[]; // the array this node lives in
  }
  let {
    node,
    depth = 0,
    currentId,
    openIds = new Set(),
    parentId = null,
    siblings = []
  }: Props = $props();

  const hasKids = $derived(node.children.length > 0);
  const isRoot = $derived(depth === 0);
  // Root, and any branch on the path to the current folder, start expanded.
  let open = $state(depth === 0 || openIds.has(node.id));
  const selected = $derived(currentId === node.id);

  // When navigation puts this folder on the path to the current one (e.g. you
  // clicked a folder tile in the main pane), expand it so the selection shows.
  $effect(() => {
    if (openIds.has(node.id)) open = true;
  });

  // ---- drag & drop ----------------------------------------------------------
  let dz = $state<'before' | 'after' | 'into' | null>(null);
  const dragging = $derived(ui.drag?.kind === 'branch' && ui.drag.id === node.id);

  function onDragStart(e: DragEvent) {
    ui.drag = { kind: 'branch', id: node.id };
    e.dataTransfer!.effectAllowed = 'move';
    e.dataTransfer!.setData('text/plain', node.name);
  }
  function onDragEnd() {
    ui.drag = null;
    dz = null;
  }
  function onDragOver(e: DragEvent) {
    const t = e.dataTransfer?.types;
    const isUrl = t?.includes('text/uri-list') || t?.includes('text/plain');
    // bookmark drag -> only "into"; branch drag -> before/after/into; URL -> into
    if (ui.drag?.kind === 'branch') {
      if (ui.drag.id === node.id) return; // not onto itself
      e.preventDefault();
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const p = (e.clientY - r.top) / r.height;
      dz = isRoot ? 'into' : p < 0.28 ? 'before' : p > 0.72 ? 'after' : 'into';
    } else if (ui.drag?.kind === 'bookmark') {
      e.preventDefault();
      dz = 'into';
    } else if (isUrl && !ui.drag) {
      e.preventDefault();
      dz = 'into';
    }
  }
  function onDrop(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    const zone = dz;
    dz = null;
    if (ui.drag?.kind === 'bookmark') {
      api.moveBookmark(ui.drag.id, node.id);
      return;
    }
    if (ui.drag?.kind === 'branch') {
      const moved = ui.drag.id;
      if (moved === node.id) return;
      if (zone === 'into') {
        api.moveFolder(moved, node.id);
      } else {
        const list = siblings.map((s) => s.id).filter((id) => id !== moved);
        const tIdx = list.indexOf(node.id);
        const at = zone === 'after' ? tIdx + 1 : tIdx;
        api.moveFolder(moved, parentId ?? node.id, at);
      }
      return;
    }
    // external URL
    const url = e.dataTransfer?.getData('text/uri-list') || e.dataTransfer?.getData('text/plain');
    if (url && /^https?:\/\//i.test(url)) api.dropUrl(node.id, url.split('\n')[0].trim());
  }

  function onContext(e: MouseEvent) {
    e.preventDefault();
    const items: MenuItem[] = [
      { label: 'New subfolder…', run: () => ui.openDialog({ kind: 'folder-new', parentId: node.id }) },
      { label: 'Add bookmark…', run: () => ui.openDialog({ kind: 'bookmark-new', branchId: node.id }) }
    ];
    if (!isRoot) {
      items.push({ label: 'Rename…', run: () => ui.openDialog({ kind: 'folder-rename', id: node.id, name: node.name }) });
      items.push({
        label: 'Delete folder',
        danger: true,
        run: () =>
          ui.openDialog({
            kind: 'confirm',
            message: `Delete “${node.name}”? Only empty folders can be deleted.`,
            confirmLabel: 'Delete',
            run: () => api.deleteFolder(node.id, currentId === node.id ? '/' : undefined)
          })
      });
    }
    ui.openMenu(e.clientX, e.clientY, items);
    if (!open && hasKids) open = true;
  }
</script>

<div
  class="node"
  class:sel={selected}
  class:dragging
  class:dz-before={dz === 'before'}
  class:dz-after={dz === 'after'}
  class:dz-into={dz === 'into'}
  style="padding-left: {6 + depth * 14}px"
  draggable={!isRoot}
  data-ctx
  oncontextmenu={onContext}
  ondragstart={onDragStart}
  ondragend={onDragEnd}
  ondragover={onDragOver}
  ondragleave={() => (dz = null)}
  ondrop={onDrop}
>
  <button
    class="twist"
    class:leaf={!hasKids}
    class:open
    aria-label={open ? 'Collapse' : 'Expand'}
    onclick={() => (open = !open)}
  >
    {#if hasKids}<Icon name="chevron" size={10} />{/if}
  </button>
  <a
    class="lbl-link"
    href="/f/{node.id}"
    ondblclick={() => { if (hasKids) open = !open; }}
  >
    <span class="fico"><Icon name={depth === 0 ? 'home' : open && hasKids ? 'folder-open' : 'folder'} size={15} /></span>
    <span class="lbl">{node.name}</span>
    {#if node.count > 0}<span class="count">{node.count}</span>{/if}
  </a>
</div>

{#if open && hasKids}
  {#each node.children as child (child.id)}
    <Self
      node={child}
      depth={depth + 1}
      {currentId}
      {openIds}
      parentId={node.id}
      siblings={node.children}
    />
  {/each}
{/if}

<style>
  .node {
    position: relative;
    display: flex;
    align-items: center;
    gap: 6px;
    height: var(--row-h);
    padding-right: 6px;
    border-radius: var(--r-sm);
    color: var(--text-dim);
    transition: background 0.1s, color 0.1s;
  }
  .node:hover { background: var(--bg-hover); color: var(--text); }
  .node.sel { background: var(--accent-soft); color: var(--accent); font-weight: 560; }
  .node.dragging { opacity: 0.4; }
  .node.dz-into { background: var(--accent-soft); box-shadow: inset 0 0 0 1.5px var(--accent-line); }
  .node.dz-before::before, .node.dz-after::after {
    content: ''; position: absolute; left: 4px; right: 4px; height: 2px;
    background: var(--accent); border-radius: 2px; z-index: 2;
  }
  .node.dz-before::before { top: -1px; }
  .node.dz-after::after { bottom: -1px; }

  .twist {
    width: 16px; height: 16px; flex: none;
    display: grid; place-items: center;
    border-radius: 4px; color: var(--text-mute);
  }
  .twist:hover { background: var(--bg-active); color: var(--text); }
  .twist :global(svg) { transition: transform 0.16s var(--ease); }
  .twist.open :global(svg) { transform: rotate(90deg); }
  .twist.leaf { visibility: hidden; }

  .lbl-link {
    flex: 1; min-width: 0;
    display: flex; align-items: center; gap: 6px;
    color: inherit;
  }
  .fico { flex: none; display: grid; place-items: center; }
  .lbl {
    flex: 1; min-width: 0;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    font-size: 13px;
  }
  .count {
    font-size: 10.5px; color: var(--text-mute);
    font-variant-numeric: tabular-nums;
    padding: 0 5px; border-radius: 99px; background: var(--bg-raised);
  }
  .node:hover .count { background: var(--bg-active); }
</style>
