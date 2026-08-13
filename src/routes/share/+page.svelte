<script lang="ts">
  import Icon from '$lib/components/Icon.svelte';
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();
</script>

<div class="wrap">
  <div class="card">
    <div class="brand"><div class="logo"></div> LinkBank</div>

    {#if data.status === 'saved'}
      <div class="ok"><Icon name="check" size={28} /></div>
      <h1>Saved to {data.folder}</h1>
      <p class="detail">{data.title}</p>
      <div class="actions">
        <a class="btn primary" href="/">Open LinkBank</a>
        <button class="btn" onclick={() => history.length > 1 ? history.back() : window.close()}>Done</button>
      </div>
    {:else if data.status === 'empty'}
      <h1>Nothing to save</h1>
      <p class="detail">No link was shared. Share a page from your browser to save it here.</p>
      <a class="btn primary" href="/">Open LinkBank</a>
    {:else if data.status === 'error'}
      <h1>Couldn’t save</h1>
      <p class="detail">{data.error}</p>
      <a class="btn primary" href="/">Open LinkBank</a>
    {:else}
      <h1>Please sign in</h1>
      <p class="detail">Sign in to LinkBank, then share the link again.</p>
      <a class="btn primary" href="/login">Sign in</a>
    {/if}
  </div>
</div>

<style>
  .wrap { min-height: calc(100dvh / var(--ui-zoom, 1)); display: grid; place-items: center; padding: 24px; background: var(--bg); }
  .card { width: min(400px, 100%); background: var(--bg-panel); border: 1px solid var(--line); border-radius: var(--r-lg); box-shadow: var(--shadow); padding: 28px; text-align: center; }
  .brand { display: flex; align-items: center; justify-content: center; gap: 8px; font-weight: 640; font-size: 14px; margin-bottom: 20px; }
  .logo { width: 22px; height: 22px; border-radius: 6px; background: linear-gradient(145deg, #4b83f0, #8659e8); }
  .ok { width: 54px; height: 54px; border-radius: 50%; display: grid; place-items: center; margin: 0 auto 14px; background: color-mix(in oklch, oklch(65% 0.16 150) 18%, transparent); color: oklch(55% 0.15 150); }
  h1 { font-size: 19px; font-weight: 640; letter-spacing: -0.02em; }
  .detail { color: var(--text-mute); font-size: 13.5px; margin-top: 6px; word-break: break-word; }
  .actions { display: flex; gap: 8px; justify-content: center; margin-top: 20px; }
  .btn { display: inline-flex; align-items: center; height: 36px; padding: 0 16px; border-radius: var(--r-md); font-size: 14px; font-weight: 540; border: 1px solid var(--line); background: var(--bg-raised); color: var(--text-dim); }
  .btn.primary { background: var(--accent); border-color: transparent; color: #fff; margin-top: 20px; }
</style>
