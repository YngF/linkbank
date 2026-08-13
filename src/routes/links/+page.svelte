<script lang="ts">
  import { onMount } from 'svelte';
  import { invalidateAll } from '$app/navigation';
  import Icon from '$lib/components/Icon.svelte';
  import Favicon from '$lib/components/Favicon.svelte';
  import { ui } from '$lib/client/ui.svelte';
  import { api } from '$lib/client/api';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  type Progress = { running: boolean; total: number; done: number; broken: number };
  let prog = $state<Progress | null>(null);
  let checking = $state(false);
  let timer: ReturnType<typeof setTimeout> | undefined;

  function ago(iso: string | null): string {
    if (!iso) return 'never';
    const then = new Date(iso.replace(' ', 'T') + 'Z').getTime();
    const s = Math.max(0, (Date.now() - then) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
  }

  async function poll() {
    const s = (await api.linkStatus().catch(() => null)) as Progress | null;
    if (!s) {
      checking = false;
      return;
    }
    prog = s;
    if (s.running) {
      checking = true;
      timer = setTimeout(poll, 1500);
    } else if (checking) {
      checking = false;
      await invalidateAll(); // pull the fresh broken list + summary
    }
  }

  async function checkNow() {
    if (checking) return;
    checking = true;
    prog = { running: true, total: data.summary.total, done: 0, broken: 0 };
    await api.checkLinks().catch(() => {});
    poll();
  }

  onMount(() => {
    // If a sweep is already in flight (e.g. the scheduler), reflect it live.
    api.linkStatus().then((s) => {
      if ((s as Progress)?.running) {
        checking = true;
        poll();
      }
    });
    return () => clearTimeout(timer);
  });

  const pct = $derived(prog && prog.total ? Math.round((prog.done / prog.total) * 100) : 0);

  function del(b: PageData['broken'][number]) {
    ui.openDialog({
      kind: 'confirm',
      message: `Delete “${b.title}”?`,
      confirmLabel: 'Delete',
      run: () => api.deleteBookmark(b.id)
    });
  }
</script>

<div class="main-inner">
  <div class="page-head">
    <h1>Broken links</h1>
    <span class="sub">
      {#if data.summary.checked === 0}
        Not checked yet
      {:else}
        {data.broken.length} broken · {data.summary.checked} of {data.summary.total} checked{#if data.summary.exempt}
          · {data.summary.exempt} exempt{/if} · last run {ago(data.summary.lastCheckedAt)}
      {/if}
    </span>
    <span class="spacer"></span>
    <button class="btn primary" onclick={checkNow} disabled={checking}>
      <Icon name="refresh" size={14} />
      {checking ? 'Checking…' : 'Check now'}
    </button>
  </div>

  {#if checking && prog}
    <div class="progress">
      <div class="bar"><div class="fill" style="width:{pct}%"></div></div>
      <div class="ptext">
        Checked {prog.done} of {prog.total}{#if prog.broken}
          · {prog.broken} broken so far{/if}
      </div>
    </div>
  {/if}

  {#if data.broken.length === 0}
    <div class="empty">
      <Icon name={data.summary.checked === 0 ? 'link' : 'home'} size={34} />
      {#if data.summary.checked === 0}
        <div>No check has run yet.</div>
        <div class="hint">Click “Check now” to scan all {data.summary.total} bookmarks for dead links.</div>
      {:else}
        <div>No broken links. 🎉</div>
        <div class="hint">All {data.summary.checked} checked bookmarks responded.</div>
      {/if}
    </div>
  {:else}
    <div class="list">
      {#each data.broken as b (b.id)}
        <div class="row">
          <Favicon url={b.url} title={b.title} />
          <div class="body">
            <div class="title">{b.title}</div>
            <a class="url" href={b.url} target="_blank" rel="noopener noreferrer">{b.url}</a>
            <div class="meta">
              <span class="reason">{b.detail ?? 'Unreachable'}</span>
              {#if b.path}· in {b.path}{/if} · checked {ago(b.checked_at)}
            </div>
          </div>
          <a class="btn" href="/f/{b.branch_id}" title="Go to the folder">Folder</a>
          <button class="btn" onclick={() => api.recheckLink(b.id)} title="Re-check this link now">
            <Icon name="refresh" size={14} />
          </button>
          <button
            class="btn"
            onclick={() => api.setLinkIgnore(b.id, true)}
            title="Exclude this link from checking (e.g. only reachable on another network)"
          >
            <Icon name="eye-off" size={14} />
          </button>
          <button class="btn danger" onclick={() => del(b)} title="Delete bookmark">
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

  .btn {
    display: inline-flex; align-items: center; gap: 6px; align-self: center;
    height: 30px; padding: 0 11px; border-radius: var(--r-md);
    font-size: 13px; font-weight: 520; flex: none;
    border: 1px solid var(--line); background: var(--bg-raised); color: var(--text-dim);
  }
  .btn:hover { background: var(--bg-hover); color: var(--text); }
  .btn.primary { background: var(--accent); border-color: transparent; color: #fff; }
  .btn.primary:hover { filter: brightness(1.08); }
  .btn.primary:disabled { opacity: 0.65; cursor: default; filter: none; }
  .btn.danger:hover {
    background: color-mix(in oklch, oklch(66% 0.19 22) 16%, transparent);
    color: oklch(60% 0.19 22); border-color: color-mix(in oklch, oklch(66% 0.19 22) 40%, transparent);
  }

  .progress { margin-bottom: 18px; }
  .bar { height: 6px; border-radius: 99px; background: var(--bg-active); overflow: hidden; }
  .fill { height: 100%; background: var(--accent); transition: width 0.3s var(--ease); }
  .ptext { font-size: 12px; color: var(--text-mute); margin-top: 6px; }

  .list { display: flex; flex-direction: column; gap: 4px; }
  .row {
    display: flex; align-items: center; gap: 12px;
    padding: 10px 12px; border-radius: var(--r-md); border: 1px solid var(--line-soft);
  }
  .row:hover { background: var(--bg-panel); }
  .row :global(.fav) { width: 34px; height: 34px; border-radius: 9px; flex: none; }
  .row :global(.fav img) { width: 20px; height: 20px; }
  .body { flex: 1; min-width: 0; }
  .title { font-size: 13.5px; font-weight: 545; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .url { display: block; font-size: 12px; color: var(--text-dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .url:hover { color: var(--accent); text-decoration: underline; }
  .meta { font-size: 11.5px; color: var(--text-mute); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .reason {
    color: oklch(58% 0.19 25); font-weight: 560;
  }

  .empty {
    text-align: center; padding: 70px 20px; color: var(--text-mute);
    border: 1.5px dashed var(--line); border-radius: var(--r-lg);
  }
  .empty :global(svg) { opacity: 0.4; margin-bottom: 12px; }
  .hint { font-size: 12px; margin-top: 5px; }
</style>
