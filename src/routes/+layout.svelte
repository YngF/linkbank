<script lang="ts">
  import '../app.css';
  import { page } from '$app/state';
  import { invalidateAll } from '$app/navigation';
  import Icon from '$lib/components/Icon.svelte';
  import TreeNode from '$lib/components/TreeNode.svelte';
  import ContextMenu from '$lib/components/ContextMenu.svelte';
  import Dialogs from '$lib/components/Dialogs.svelte';
  import Toasts from '$lib/components/Toasts.svelte';
  import Search from '$lib/components/Search.svelte';
  import WebSearch from '$lib/components/WebSearch.svelte';
  import CurrencyConverter from '$lib/components/CurrencyConverter.svelte';
  import PasswordGenerator from '$lib/components/PasswordGenerator.svelte';
  import Logo from '$lib/components/Logo.svelte';
  import ShortcutsOverlay from '$lib/components/ShortcutsOverlay.svelte';
  import { ui } from '$lib/client/ui.svelte';
  import { api } from '$lib/client/api';
  import { dotStyle } from '$lib/tagcolour';
  import type { TreeNode as TNode, UiTag } from '$lib/server/db/types';
  import type { LayoutData } from './$types';

  const tagDot = (hue: number) => dotStyle(hue);
  function tagMenu(e: MouseEvent, t: UiTag) {
    e.preventDefault();
    ui.openMenu(e.clientX, e.clientY, [
      { label: 'Edit tag…', run: () => ui.openDialog({ kind: 'tag-edit', id: t.id, name: t.name, hue: t.hue }) },
      {
        label: 'Delete tag',
        danger: true,
        run: () =>
          ui.openDialog({
            kind: 'confirm',
            message: `Delete the tag “${t.name}”? Bookmarks keep existing; they just lose this tag.`,
            confirmLabel: 'Delete',
            run: () => api.deleteTag(t.id)
          })
      }
    ]);
  }

  let shortcutsOpen = $state(false);
  let fileInput = $state<HTMLInputElement | null>(null);
  async function onImportFile(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const html = await file.text();
    input.value = ''; // allow re-selecting the same file
    await api.importHtml(html);
  }

  interface Props {
    data: LayoutData;
    children: import('svelte').Snippet;
  }
  let { data, children }: Props = $props();

  // Auth pages (login/setup/register) render standalone, without app chrome.
  const isAuthPage = $derived(/^\/(login|setup|register|invite|share)(\/|$)/.test(page.url.pathname));

  // Current folder + its ancestor chain, derived from the URL and the tree —
  // so the sidebar highlights and auto-expands to the open folder.
  const currentId = $derived.by(() => {
    const m = page.url.pathname.match(/^\/f\/(\d+)/);
    return m ? Number(m[1]) : null;
  });

  const openIds = $derived.by(() => {
    const ids = new Set<number>();
    if (currentId === null) return ids;
    const find = (nodes: TNode[], trail: number[]): boolean => {
      for (const n of nodes) {
        if (n.id === currentId) {
          trail.forEach((id) => ids.add(id));
          return true;
        }
        if (find(n.children, [...trail, n.id])) return true;
      }
      return false;
    };
    find(data.tree, []);
    return ids;
  });

  let theme = $state<'dark' | 'light'>('light');
  function toggleTheme() {
    theme = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('lb-theme', theme);
    } catch {
      /* ignore */
    }
  }

  // Accessibility: scale the whole UI (text + icons). CSS `zoom` scales the
  // px-based layout cleanly and is applied to <html> by the app.html bootstrap.
  const SCALES = [0.85, 1, 1.15, 1.3, 1.5];
  let scale = $state(1);
  function applyScale(s: number) {
    scale = s;
    ui.zoom = s;
    document.documentElement.style.zoom = String(s);
    document.documentElement.style.setProperty('--ui-zoom', String(s));
    try {
      localStorage.setItem('lb-scale', String(s));
    } catch {
      /* ignore */
    }
  }
  function stepScale(dir: 1 | -1) {
    let i = SCALES.findIndex((x) => Math.abs(x - scale) < 0.01);
    if (i < 0) i = 1;
    applyScale(SCALES[Math.max(0, Math.min(SCALES.length - 1, i + dir))]);
  }

  // Sync reactive state with whatever the bootstrap already applied.
  $effect(() => {
    theme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
    const z = parseFloat(document.documentElement.style.zoom || '1');
    if (z) {
      scale = z;
      ui.zoom = z;
    }
    try {
      const st = localStorage.getItem('lb-sidebar-tab');
      if (st === 'tags' || st === 'library') sidebarTab = st;
    } catch {
      /* ignore */
    }
  });

  // Track the responsive breakpoint where the sidebar tree collapses to a
  // drawer. Crossing it sets a sensible default for the show-folders toggle
  // (visible on narrow/mobile so you can navigate, hidden on wide) — but the
  // toggle itself stays in control afterwards, so it works on mobile too.
  $effect(() => {
    const mq = window.matchMedia('(max-width: 860px)');
    let prev: boolean | undefined;
    const update = () => {
      const narrow = mq.matches;
      ui.narrow = narrow;
      if (narrow !== prev) {
        prev = narrow;
        ui.showFolders = narrow;
      }
    };
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  });

  // Sidebar view: the folder tree (+ a compact tags list below it, as before)
  // or a tags-first view for people who lean on tags heavily.
  let sidebarTab = $state<'library' | 'tags'>('library');
  function setSidebarTab(t: 'library' | 'tags') {
    sidebarTab = t;
    try {
      localStorage.setItem('lb-sidebar-tab', t);
    } catch {
      /* ignore */
    }
  }

  let navOpen = $state(false);

  // Hide the folder-tree sidebar on desktop, mirroring the portrait/narrow
  // layout (folders then appear as tiles in the main window via ui.showFolders).
  // Doesn't apply on narrow, where the drawer already governs the tree.
  let treeCollapsed = $state(false);
  const collapsed = $derived(treeCollapsed && !ui.narrow);

  function collapseTree() {
    treeCollapsed = true;
    ui.showFolders = true; // surface folders in the main pane while the tree is hidden
  }
  // The top-left toggle: opens the drawer on mobile; restores the tree on desktop.
  function onMenuToggle() {
    if (ui.narrow) {
      navOpen = !navOpen;
    } else {
      treeCollapsed = false;
      ui.showFolders = false;
    }
  }

  // Refresh sidebar counts + the current view when the tab regains focus, so
  // bookmarks added out-of-band — the browser extension, the PWA share target,
  // or another device/tab — show up without a manual reload. Focus/visibility
  // is proxy-safe (no long-lived connection) and covers the common case: you
  // save with the extension on another tab, then switch back to LinkBank.
  $effect(() => {
    let last = 0;
    const refresh = () => {
      if (document.visibilityState !== 'visible') return;
      if (isAuthPage || ui.dialog) return; // don't yank data out from under a dialog
      const now = Date.now();
      if (now - last < 1000) return; // de-dupe focus + visibilitychange firing together
      last = now;
      invalidateAll();
    };
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
    };
  });
</script>

{#if isAuthPage}
  {@render children()}
{:else}
<div id="app" class:has-bg={data.bgVersion} class:tree-collapsed={collapsed}>
  {#if data.bgVersion}
    <div class="bg-layer" style="background-image: url(/background?v={encodeURIComponent(data.bgVersion)})"></div>
  {/if}
  <div class="brand">
    <Logo size={24} id="lb-brand" />
    <b>LinkBank</b>
  </div>

  <div class="topbar">
    <button class="iconbtn menu-toggle" onclick={onMenuToggle} aria-label="Show folder tree" title="Show folder tree">
      <Icon name="panel" />
    </button>
    <WebSearch engine={data.settings.searchEngine} />
    <Search />
    <button
      class="iconbtn"
      class:on={ui.showFolders}
      onclick={() => (ui.showFolders = !ui.showFolders)}
      aria-label="Show or hide sub-folders in this view"
      title={ui.showFolders ? 'Hide sub-folders in the main view' : 'Show sub-folders in the main view'}
    >
      <Icon name="folder" />
    </button>
    <div class="textsize" role="group" aria-label="Text size">
      <button class="iconbtn tsize" onclick={() => stepScale(-1)} disabled={scale <= SCALES[0]} title="Smaller text &amp; icons" aria-label="Decrease size">A−</button>
      <button class="iconbtn tsize lg" onclick={() => stepScale(1)} disabled={scale >= SCALES[SCALES.length - 1]} title="Larger text &amp; icons" aria-label="Increase size">A+</button>
    </div>
    <button class="iconbtn" onclick={toggleTheme} aria-label="Toggle theme" title="Toggle dark mode">
      <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
    </button>
    {#if data.modules.includes('currency') && data.settings.showCurrency}
      <CurrencyConverter />
    {/if}
    {#if data.modules.includes('password') && data.settings.showPassword}
      <PasswordGenerator />
    {/if}
    <div class="user">
      <a class="uname" href="/settings" title="Settings">{data.username}</a>
      {#if data.isAdmin}
        <a class="iconbtn" href="/admin" aria-label="Users & access" title="Users & access" class:on={page.url.pathname === '/admin'}>
          <Icon name="shield" />
        </a>
      {/if}
      <a class="iconbtn" href="/settings" aria-label="Settings" title="Settings" class:on={page.url.pathname.startsWith('/settings')}>
        <Icon name="settings" />
      </a>
      <form method="POST" action="/logout">
        <button class="iconbtn" aria-label="Sign out" title="Sign out"><Icon name="logout" /></button>
      </form>
    </div>
  </div>

  {#snippet hideSidebarBtn()}
    <button
      class="side-toggle"
      title="Hide the sidebar"
      aria-label="Hide the sidebar"
      onclick={collapseTree}
    >
      <Icon name="panel" size={13} />
    </button>
  {/snippet}

  {#snippet addRootBtn()}
    <button
      class="add-root"
      title="New folder at top level"
      aria-label="New folder"
      onclick={() => ui.openDialog({ kind: 'folder-new', parentId: data.tree[0].id })}
    >
      <Icon name="plus" size={13} />
    </button>
  {/snippet}

  {#snippet tagRow(t: UiTag)}
    <a
      class="tagrow"
      href="/tag/{t.id}"
      class:active={page.url.pathname === `/tag/${t.id}`}
      data-ctx
      oncontextmenu={(e) => tagMenu(e, t)}
    >
      <span class="tdot" style={tagDot(t.hue)}></span>
      <span class="tname">{t.name}</span>
      <span class="tcount">{t.count}</span>
    </a>
  {/snippet}

  <aside class="sidebar" class:open={navOpen}>
    {#if data.settings.tagsDisplay === 'tabs'}
      <div class="side-head">
        {@render hideSidebarBtn()}
        <div class="side-tabs" role="tablist" aria-label="Sidebar view">
          <button
            class="side-tab"
            role="tab"
            aria-selected={sidebarTab === 'library'}
            class:active={sidebarTab === 'library'}
            onclick={() => setSidebarTab('library')}
          >
            Library
          </button>
          <button
            class="side-tab"
            role="tab"
            aria-selected={sidebarTab === 'tags'}
            class:active={sidebarTab === 'tags'}
            onclick={() => setSidebarTab('tags')}
          >
            Tags
          </button>
        </div>
        {#if sidebarTab === 'library' && data.tree[0]}
          {@render addRootBtn()}
        {/if}
      </div>

      {#if sidebarTab === 'library'}
        <nav class="tree">
          {#each data.tree as root (root.id)}
            <TreeNode node={root} {currentId} {openIds} />
          {/each}
        </nav>
      {:else}
        <nav class="taglist taglist-full">
          {#if data.tags.length}
            {#each data.tags as t (t.id)}
              {@render tagRow(t)}
            {/each}
          {:else}
            <div class="empty-tags">No tags yet — tag a bookmark to see it here.</div>
          {/if}
        </nav>
      {/if}
    {:else}
      <div class="side-head">
        {@render hideSidebarBtn()}
        Library
        {#if data.tree[0]}
          {@render addRootBtn()}
        {/if}
      </div>
      <nav class="tree">
        {#each data.tree as root (root.id)}
          <TreeNode node={root} {currentId} {openIds} />
        {/each}
      </nav>

      {#if data.tags.length}
        <div class="side-head tags-head">Tags</div>
        <nav class="taglist">
          {#each data.tags as t (t.id)}
            {@render tagRow(t)}
          {/each}
        </nav>
      {/if}
    {/if}

    <div class="side-foot">
      <a class="foot-btn" href="/links" title="Bookmarks whose links look broken" class:active={page.url.pathname === '/links'}>
        Broken{#if data.brokenCount}<span class="tbadge warn">{data.brokenCount}</span>{/if}
      </a>
      <a class="foot-btn" href="/trash" title="View trashed items" class:active={page.url.pathname === '/trash'}>
        Trash{#if data.trashCount}<span class="tbadge">{data.trashCount}</span>{/if}
      </a>
      <a class="foot-btn" href="/api/export" title="Download all bookmarks as an HTML file">Export</a>
      <button class="foot-btn" onclick={() => fileInput?.click()} title="Import a browser bookmark HTML file">Import</button>
      <input
        bind:this={fileInput}
        type="file"
        accept=".html,text/html"
        style="display:none"
        onchange={onImportFile}
      />
    </div>
  </aside>

  {#if navOpen}<button class="scrim-side" aria-label="Close menu" onclick={() => (navOpen = false)}></button>{/if}

  <main class="main">
    {@render children()}
  </main>
</div>

{/if}

<svelte:window
  onkeydown={(e) => {
    const t = e.target as HTMLElement | null;
    const typing = !!t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable);
    if (e.key === '?' && !typing && !ui.dialog) {
      e.preventDefault();
      shortcutsOpen = !shortcutsOpen;
    }
  }}
/>

<ContextMenu />
<Dialogs />
<Toasts />
<ShortcutsOverlay bind:open={shortcutsOpen} />

<style>
  #app {
    display: grid;
    grid-template-columns: var(--sidebar-w) 1fr;
    grid-template-rows: 48px 1fr;
    grid-template-areas: 'brand top' 'side main';
    /* Divide by the UI zoom: CSS `zoom` doesn't scale viewport units, so a plain
       100dvh renders taller than the screen when zoomed in (pushing the sidebar
       footer off-screen). Dividing first makes the rendered height = one viewport. */
    height: calc(100dvh / var(--ui-zoom, 1));
  }

  /* Custom background image (Settings → Personalization). The image sits on a
     fixed layer behind everything; the chrome panels become translucent + frosted
     so it shows through — strongly behind the bookmarks, subtly behind the tree. */
  #app.has-bg { isolation: isolate; }
  .bg-layer {
    position: fixed; inset: 0; z-index: -1;
    background-size: cover; background-position: center; background-repeat: no-repeat;
    pointer-events: none;
  }
  #app.has-bg .brand,
  #app.has-bg .topbar {
    background: color-mix(in oklch, var(--bg-panel) 70%, transparent);
    backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
  }
  #app.has-bg .sidebar {
    background: color-mix(in oklch, var(--bg-panel) 75%, transparent);
    backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
  }

  .brand {
    grid-area: brand;
    display: flex; align-items: center; gap: 9px;
    padding: 0 14px;
    border-right: 1px solid var(--line);
    border-bottom: 1px solid var(--line);
    background: var(--bg-panel);
  }
  .brand b { font-size: 13.5px; letter-spacing: -0.01em; }
  .brand .env {
    margin-left: auto; font-size: 10px; letter-spacing: 0.05em;
    color: var(--text-mute);
    border: 1px solid var(--line); padding: 1px 6px; border-radius: 99px;
  }

  .topbar {
    grid-area: top;
    display: flex; align-items: center; gap: 8px;
    padding: 0 12px;
    border-bottom: 1px solid var(--line);
    background: var(--bg-panel);
    /* Sit above the main content so top-bar dropdowns (currency, search) aren't
       trapped behind it — the frosted `backdrop-filter` makes the bar its own
       stacking context, which otherwise paints below the bookmarks. */
    position: relative;
    z-index: 20;
  }
  .search {
    margin-left: auto;
    display: flex; align-items: center; gap: 7px;
    background: var(--bg); border: 1px solid var(--line);
    border-radius: var(--r-md); padding: 0 9px; height: 30px;
    width: 240px; color: var(--text-mute);
  }
  .search input { background: none; border: 0; outline: 0; width: 100%; font-size: 13px; }

  .iconbtn {
    width: 30px; height: 30px; border-radius: var(--r-md);
    display: grid; place-items: center; color: var(--text-dim); flex: none;
    transition: background 0.12s, color 0.12s;
  }
  .iconbtn:hover { background: var(--bg-hover); color: var(--text); }
  .iconbtn.on { background: var(--accent-soft); color: var(--accent); }
  .iconbtn:disabled { opacity: 0.4; cursor: default; }
  .textsize { display: flex; align-items: center; gap: 1px; }
  .tsize { font-size: 12px; font-weight: 640; width: 26px; }
  .tsize.lg { font-size: 15px; }

  .user { display: flex; align-items: center; gap: 4px; padding-left: 6px; margin-left: 2px; border-left: 1px solid var(--line); }
  .user form { display: flex; }
  .uname {
    font-size: 12.5px; color: var(--text-dim); max-width: 120px;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    padding: 3px 4px; border-radius: var(--r-sm);
  }
  a.uname:hover { background: var(--bg-hover); color: var(--text); }
  @media (max-width: 860px) { .uname { display: none; } }

  .sidebar {
    grid-area: side;
    border-right: 1px solid var(--line);
    background: var(--bg-panel);
    display: flex; flex-direction: column;
    min-height: 0;
  }
  .side-head {
    display: flex; align-items: center; gap: 4px;
    padding: 10px 12px 6px;
    font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.07em;
    color: var(--text-mute); font-weight: 600;
  }
  .side-tabs { display: flex; align-items: center; gap: 2px; flex: 1; min-width: 0; }
  .side-tab {
    padding: 4px 9px; border-radius: var(--r-sm);
    font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.07em; font-weight: 600;
    color: var(--text-mute);
  }
  .side-tab:hover { background: var(--bg-hover); color: var(--text); }
  .side-tab.active { background: var(--accent-soft); color: var(--accent); }
  .add-root {
    margin-left: auto; width: 22px; height: 22px; border-radius: 6px;
    display: grid; place-items: center; color: var(--text-mute);
  }
  .add-root:hover { background: var(--bg-hover); color: var(--text); }
  .side-toggle {
    width: 22px; height: 22px; border-radius: 6px; margin: 0 4px 0 -2px;
    display: grid; place-items: center; color: var(--text-mute); flex: none;
  }
  .side-toggle:hover { background: var(--bg-hover); color: var(--text); }
  .tree { flex: 1; overflow: auto; padding: 0 8px 8px; min-height: 0; }

  .tags-head { padding-top: 8px; border-top: 1px solid var(--line-soft); }
  .taglist {
    flex: none; max-height: 34%; overflow: auto; padding: 0 8px 8px;
    display: flex; flex-direction: column; gap: 1px;
  }
  .taglist.taglist-full { flex: 1; max-height: none; min-height: 0; padding-top: 4px; }
  .empty-tags { padding: 16px 12px; font-size: 12.5px; color: var(--text-mute); text-align: center; }
  .tagrow {
    display: flex; align-items: center; gap: 8px;
    padding: 5px 8px; border-radius: var(--r-sm); font-size: 13px; color: var(--text-dim);
  }
  .tagrow:hover { background: var(--bg-hover); color: var(--text); }
  .tagrow.active { background: var(--accent-soft); color: var(--accent); }
  .tdot { width: 9px; height: 9px; border-radius: 50%; flex: none; }
  .tname { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tcount { font-size: 11px; color: var(--text-mute); font-variant-numeric: tabular-nums; }

  .side-foot {
    display: flex; flex-wrap: wrap; gap: 6px; padding: 8px 12px;
    border-top: 1px solid var(--line-soft);
  }
  .foot-btn {
    flex: 1 1 calc(50% - 3px); text-align: center;
    font-size: 12px; color: var(--text-dim);
    padding: 5px 8px; border-radius: var(--r-sm);
    border: 1px solid var(--line); background: var(--bg-raised);
  }
  .foot-btn:hover { background: var(--bg-hover); color: var(--text); }
  .foot-btn.active { background: var(--accent-soft); color: var(--accent); border-color: var(--accent-line); }
  .tbadge {
    margin-left: 5px; font-size: 10.5px; font-variant-numeric: tabular-nums;
    background: var(--accent); color: #fff; border-radius: 99px; padding: 0 5px;
  }
  .tbadge.warn { background: oklch(62% 0.2 25); }

  .main { grid-area: main; overflow: auto; min-height: 0; }

  .menu-toggle { display: none; }
  .scrim-side { display: none; }

  /* Desktop "hide folder tree": collapse to a single column (like portrait),
     show the top-left toggle to bring the tree back. */
  #app.tree-collapsed { grid-template-columns: 1fr; grid-template-areas: 'top' 'main'; }
  #app.tree-collapsed .brand { display: none; }
  #app.tree-collapsed .sidebar { display: none; }
  #app.tree-collapsed .menu-toggle { display: grid; }

  @media (max-width: 860px) {
    /* The hide-tree button is meaningless in the mobile drawer. */
    .side-toggle { display: none; }
    #app { grid-template-columns: 1fr; grid-template-areas: 'top' 'main'; grid-template-rows: 48px 1fr; }
    .brand { display: none; }
    .sidebar {
      position: fixed; inset: 0 auto 0 0; width: var(--sidebar-w); z-index: 55;
      transform: translateX(-100%); transition: transform 0.22s var(--ease);
      box-shadow: var(--shadow);
    }
    .sidebar.open { transform: none; }
    .scrim-side { display: block; position: fixed; inset: 0; z-index: 54; background: oklch(10% 0 0 / 0.5); }
    .menu-toggle { display: grid; }
  }
</style>
