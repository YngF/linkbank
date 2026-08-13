<script lang="ts">
  import { ui } from '$lib/client/ui.svelte';
  import { api } from '$lib/client/api';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import Favicon from './Favicon.svelte';
  import Icon from './Icon.svelte';
  import TagInput from './TagInput.svelte';
  import { HUE_SWATCHES, dotStyle } from '$lib/tagcolour';

  let iconInput = $state<HTMLInputElement | null>(null);
  async function onIconFile(e: Event, url: string) {
    const input = e.currentTarget as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    if (f) await api.uploadFavicon(url, f);
  }

  // Local form state, seeded when a dialog opens.
  let url = $state('');
  let title = $state('');
  let notes = $state('');
  let name = $state('');
  let linkIgnore = $state(false);
  let tagNames = $state<string[]>([]);
  let tagHue = $state<number | null>(null);
  let busy = $state(false);
  let fetchingTitle = $state(false);

  // bulk dialogs
  let folderList = $state<{ id: number; name: string; depth: number }[]>([]);
  let folderFilter = $state('');
  let bulkAdd = $state<string[]>([]);
  let bulkRemove = $state<string[]>([]);
  const shownFolderList = $derived(
    folderFilter.trim()
      ? folderList.filter((f) => f.name.toLowerCase().includes(folderFilter.trim().toLowerCase()))
      : folderList
  );

  let lastKind: string | null = null;
  $effect(() => {
    const d = ui.dialog;
    const kind = d?.kind ?? null;
    if (kind === lastKind) return; // only re-seed when the dialog changes
    lastKind = kind;
    if (d?.kind === 'bookmark-new') {
      url = ''; title = ''; notes = ''; linkIgnore = false; tagNames = [];
    } else if (d?.kind === 'bookmark-edit') {
      url = d.url; title = d.title; notes = d.notes; linkIgnore = d.linkIgnore; tagNames = [...d.tags];
    } else if (d?.kind === 'folder-new') {
      name = '';
    } else if (d?.kind === 'folder-rename') {
      name = d.name;
    } else if (d?.kind === 'tag-edit') {
      name = d.name; tagHue = d.hue;
    } else if (d?.kind === 'bulk-move') {
      folderFilter = ''; folderList = [];
      fetch('/api/folders').then((r) => r.json()).then((j) => (folderList = j.folders ?? [])).catch(() => {});
    } else if (d?.kind === 'bulk-tags') {
      bulkAdd = []; bulkRemove = [];
    }
  });

  async function doBulkMove(toBranchId: number) {
    const d = ui.dialog;
    if (d?.kind !== 'bulk-move' || busy) return;
    busy = true;
    if (d.action === 'copy') await api.bulkCopy(d.bookmarkIds, toBranchId);
    else await api.bulkMove(d.bookmarkIds, d.branchIds, toBranchId);
    busy = false;
    ui.clearSel();
    ui.closeDialog();
  }

  async function onUrlBlur() {
    if (ui.dialog?.kind !== 'bookmark-new') return;
    if (!title.trim() && /^https?:\/\//i.test(url)) {
      fetchingTitle = true;
      const t = await api.fetchTitle(url);
      if (t && !title.trim()) title = t;
      fetchingTitle = false;
    }
  }

  async function submit() {
    const d = ui.dialog;
    if (!d || busy) return;
    busy = true;
    let ok: unknown = null;
    if (d.kind === 'bookmark-new') ok = await api.createBookmark(d.branchId, url, title, notes, tagNames);
    else if (d.kind === 'bookmark-edit') ok = await api.updateBookmark(d.id, { title, url, notes, linkIgnore, tags: tagNames });
    else if (d.kind === 'folder-new') ok = await api.createFolder(d.parentId, name);
    else if (d.kind === 'folder-rename') ok = await api.renameFolder(d.id, name);
    else if (d.kind === 'tag-edit') ok = await api.updateTag(d.id, { name, hue: tagHue });
    else if (d.kind === 'bulk-tags') {
      ok = await api.bulkTags(d.bookmarkIds, bulkAdd, bulkRemove);
      ui.clearSel();
    }
    else if (d.kind === 'confirm') { d.run(); ok = true; }
    busy = false;
    if (ok !== null) ui.closeDialog();
  }
</script>

{#if ui.dialog}
  <div
    class="scrim"
    role="button"
    tabindex="-1"
    onclick={(e) => e.target === e.currentTarget && ui.closeDialog()}
    onkeydown={(e) => e.key === 'Escape' && ui.closeDialog()}
  >
    <div class="dialog" role="dialog" aria-modal="true">
      {#if ui.dialog.kind === 'bookmark-new' || ui.dialog.kind === 'bookmark-edit'}
        <h2>{ui.dialog.kind === 'bookmark-new' ? 'Add bookmark' : 'Edit bookmark'}</h2>
        <div class="body">
          <label>URL
            <!-- svelte-ignore a11y_autofocus -->
            <input bind:value={url} placeholder="https://…" onblur={onUrlBlur} autofocus />
            <span class="field-hint">Tip: enter <code>note</code> or <code>memo</code> to make a notes-only card.</span>
          </label>
          <label>Title
            <input bind:value={title} placeholder={fetchingTitle ? 'Fetching title…' : 'Optional — filled from the page'} />
          </label>
          <label>Notes
            <textarea bind:value={notes} rows="3"></textarea>
          </label>
          <label>Tags
            <TagInput bind:tags={tagNames} />
          </label>
          {#if ui.dialog.kind === 'bookmark-edit' && /^https?:\/\//i.test(url)}
            <div class="icon-row">
              <span class="icon-label">Icon</span>
              {#key ui.faviconVersion}
                <Favicon {url} title={title || url} />
              {/key}
              <div class="icon-actions">
                <button type="button" class="link-btn" onclick={() => iconInput?.click()}>Upload custom…</button>
                <button type="button" class="link-btn" onclick={() => api.resetFavicon(url)}>Reset to automatic</button>
              </div>
              <input bind:this={iconInput} type="file" accept="image/*" style="display:none" onchange={(e) => onIconFile(e, url)} />
            </div>
            <label class="check">
              <input type="checkbox" bind:checked={linkIgnore} />
              <span>Skip link-rot check for this bookmark</span>
            </label>
          {/if}
        </div>
      {:else if ui.dialog.kind === 'folder-new' || ui.dialog.kind === 'folder-rename'}
        <h2>{ui.dialog.kind === 'folder-new' ? 'New folder' : 'Rename folder'}</h2>
        <div class="body">
          <label>Name
            <!-- svelte-ignore a11y_autofocus -->
            <input bind:value={name} placeholder="Folder name" autofocus
              onkeydown={(e) => e.key === 'Enter' && submit()} />
          </label>
        </div>
      {:else if ui.dialog.kind === 'note-view'}
        <h2>{ui.dialog.title}</h2>
        <div class="body">
          {#if ui.dialog.notes.trim()}
            <p class="note-body">{ui.dialog.notes}</p>
          {:else}
            <p class="msg empty-note">This note is empty. Click Edit to add some text.</p>
          {/if}
        </div>
      {:else if ui.dialog.kind === 'tag-edit'}
        <h2>Edit tag</h2>
        <div class="body">
          <label>Name
            <!-- svelte-ignore a11y_autofocus -->
            <input bind:value={name} placeholder="Tag name" autofocus onkeydown={(e) => e.key === 'Enter' && submit()} />
          </label>
          <div class="swatches" role="radiogroup" aria-label="Tag colour">
            {#each HUE_SWATCHES as h (h)}
              <button
                type="button"
                class="swatch"
                class:sel={tagHue === h}
                style={dotStyle(h)}
                aria-label={`Colour ${h}`}
                onclick={() => (tagHue = h)}
              ></button>
            {/each}
          </div>
        </div>
      {:else if ui.dialog.kind === 'bulk-move'}
        <h2>
          {ui.dialog.action === 'copy'
            ? `Copy ${ui.dialog.bookmarkIds.length} bookmark(s) to…`
            : `Move ${ui.dialog.bookmarkIds.length + ui.dialog.branchIds.length} item(s) to…`}
        </h2>
        <div class="body">
          <input bind:value={folderFilter} placeholder="Filter folders…" />
          <div class="folderlist">
            {#each shownFolderList as f (f.id)}
              <button type="button" class="folderopt" style="padding-left:{10 + f.depth * 16}px" onclick={() => doBulkMove(f.id)}>
                <Icon name="folder" size={14} />
                {f.name}
              </button>
            {:else}
              <div class="msg" style="padding:10px">No folders match.</div>
            {/each}
          </div>
        </div>
      {:else if ui.dialog.kind === 'bulk-tags'}
        <h2>Tag {ui.dialog.bookmarkIds.length} bookmark(s)</h2>
        <div class="body">
          <label>Add tags
            <TagInput bind:tags={bulkAdd} />
          </label>
          {#if ui.dialog.current.length}
            <div class="removeblock">
              <span class="rmlabel">Remove tags</span>
              <div class="rmchips">
                {#each ui.dialog.current as t (t)}
                  <button
                    type="button"
                    class="rmchip"
                    class:on={bulkRemove.includes(t)}
                    onclick={() => (bulkRemove = bulkRemove.includes(t) ? bulkRemove.filter((x) => x !== t) : [...bulkRemove, t])}
                  >{t}{#if bulkRemove.includes(t)} ✓{/if}</button>
                {/each}
              </div>
            </div>
          {/if}
        </div>
      {:else if ui.dialog.kind === 'confirm'}
        <h2>Please confirm</h2>
        <div class="body"><p class="msg">{ui.dialog.message}</p></div>
      {/if}

      {#if ui.dialog.kind === 'bulk-move'}
        <div class="foot">
          <button class="btn" onclick={() => ui.closeDialog()}>Cancel</button>
        </div>
      {:else if ui.dialog.kind === 'note-view'}
        <div class="foot">
          <button class="btn" onclick={() => ui.closeDialog()}>Close</button>
          <button
            class="btn primary"
            onclick={() => {
              const d = ui.dialog;
              if (d?.kind === 'note-view')
                ui.openDialog({ kind: 'bookmark-edit', id: d.id, title: d.title, url: d.url, notes: d.notes, branchId: d.branchId, linkIgnore: false, tags: d.tags });
            }}>Edit</button>
        </div>
      {:else}
        <div class="foot">
          {#if ui.dialog.kind === 'tag-edit'}
            {@const tid = ui.dialog.id}
            <button
              class="btn danger"
              onclick={() => {
                ui.closeDialog();
                api.deleteTag(tid);
                if (page.url.pathname === `/tag/${tid}`) goto('/');
              }}>Delete</button>
            <span style="flex:1"></span>
          {/if}
          <button class="btn" onclick={() => ui.closeDialog()}>Cancel</button>
          <button class="btn primary" onclick={submit} disabled={busy}>
            {ui.dialog.kind === 'confirm' ? ui.dialog.confirmLabel : busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .scrim {
    position: fixed; inset: 0; z-index: 70;
    background: oklch(10% 0 0 / 0.55); backdrop-filter: blur(3px);
    display: flex; align-items: flex-start; justify-content: center; padding-top: 12vh;
  }
  .dialog {
    width: min(520px, 92vw);
    background: var(--bg-raised); border: 1px solid var(--line);
    border-radius: var(--r-lg); box-shadow: var(--shadow); overflow: hidden;
    animation: pop 0.13s var(--ease);
  }
  @keyframes pop { from { opacity: 0; transform: scale(0.97) translateY(-4px); } }
  h2 { font-size: 15px; font-weight: 600; padding: 14px 16px; border-bottom: 1px solid var(--line-soft); }
  .body { padding: 16px; display: flex; flex-direction: column; gap: 12px; }
  label { display: flex; flex-direction: column; gap: 5px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-mute); font-weight: 600; }
  input, textarea {
    background: var(--bg); border: 1px solid var(--line); border-radius: var(--r-md);
    padding: 8px 10px; font-size: 13.5px; outline: 0; width: 100%;
    color: var(--text); text-transform: none; letter-spacing: normal; font-weight: 400;
  }
  input:focus, textarea:focus { border-color: var(--accent-line); }
  textarea { resize: vertical; font-family: inherit; }
  .msg { text-transform: none; letter-spacing: normal; font-weight: 400; color: var(--text-dim); font-size: 13.5px; }

  .check {
    flex-direction: row; align-items: center; gap: 8px;
    text-transform: none; letter-spacing: normal; font-weight: 400;
    font-size: 13px; color: var(--text-dim); cursor: pointer;
  }
  .check input { width: auto; }

  .note-body {
    white-space: pre-wrap; word-break: break-word;
    text-transform: none; letter-spacing: normal; font-weight: 400;
    color: var(--text); font-size: 14px; line-height: 1.55;
  }
  .empty-note { font-style: italic; }

  .field-hint {
    text-transform: none; letter-spacing: normal; font-weight: 400;
    font-size: 11.5px; color: var(--text-mute);
  }
  .field-hint code {
    font-family: ui-monospace, monospace; font-size: 11px;
    background: var(--bg-active); padding: 0 4px; border-radius: 4px;
  }

  .icon-row { display: flex; align-items: center; gap: 12px; }
  .icon-label {
    font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em;
    color: var(--text-mute); font-weight: 600; width: 34px; flex: none;
  }
  .icon-actions { display: flex; flex-direction: column; gap: 4px; align-items: flex-start; }
  .link-btn {
    font-size: 12.5px; color: var(--accent); padding: 2px 0; background: none;
    text-transform: none; letter-spacing: normal; font-weight: 500;
  }
  .link-btn:hover { text-decoration: underline; }
  .foot { padding: 12px 16px; border-top: 1px solid var(--line-soft); display: flex; justify-content: flex-end; gap: 8px; background: var(--bg-panel); }
  .btn {
    height: 30px; padding: 0 12px; border-radius: var(--r-md); font-size: 13px; font-weight: 520;
    border: 1px solid var(--line); background: var(--bg-raised); color: var(--text-dim);
  }
  .btn:hover { background: var(--bg-hover); color: var(--text); }
  .btn.primary { background: var(--accent); border-color: transparent; color: #fff; }
  .btn.primary:hover { filter: brightness(1.08); }
  .btn:disabled { opacity: 0.6; cursor: default; }
  .btn.danger { color: oklch(58% 0.19 25); }
  .btn.danger:hover {
    background: color-mix(in oklch, oklch(66% 0.19 22) 16%, transparent);
    border-color: color-mix(in oklch, oklch(66% 0.19 22) 40%, transparent);
  }

  .swatches { display: flex; flex-wrap: wrap; gap: 7px; }
  .swatch {
    width: 24px; height: 24px; border-radius: 50%; flex: none;
    border: 2px solid transparent; box-shadow: 0 0 0 1px var(--line) inset;
  }
  .swatch.sel { border-color: var(--text); }

  .folderlist {
    max-height: 320px; overflow: auto; display: flex; flex-direction: column; gap: 1px;
    border: 1px solid var(--line-soft); border-radius: var(--r-md); padding: 4px;
  }
  .folderopt {
    display: flex; align-items: center; gap: 8px; width: 100%; text-align: left;
    padding: 7px 8px; border-radius: var(--r-sm); font-size: 13.5px; color: var(--text-dim);
    text-transform: none; letter-spacing: normal; font-weight: 450;
  }
  .folderopt:hover { background: var(--bg-hover); color: var(--text); }
  .folderopt :global(svg) { color: var(--text-mute); flex: none; }

  .removeblock { display: flex; flex-direction: column; gap: 6px; }
  .rmlabel { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-mute); font-weight: 600; }
  .rmchips { display: flex; flex-wrap: wrap; gap: 6px; }
  .rmchip {
    font-size: 12px; padding: 2px 9px; border-radius: 999px;
    border: 1px solid var(--line); color: var(--text-dim); background: var(--bg);
    text-transform: none; letter-spacing: normal;
  }
  .rmchip.on {
    background: color-mix(in oklch, oklch(66% 0.19 22) 16%, transparent);
    color: oklch(58% 0.19 25); border-color: color-mix(in oklch, oklch(66% 0.19 22) 40%, transparent);
  }
</style>
