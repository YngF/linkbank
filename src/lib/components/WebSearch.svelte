<script lang="ts">
  import Icon from './Icon.svelte';
  import { SEARCH_ENGINES, engineById } from '$lib/searchEngines';

  interface Props {
    engine: string; // current engine id (from settings)
  }
  let { engine }: Props = $props();

  let engineId = $state(engine);
  let q = $state('');

  // Follow the engine set elsewhere (e.g. the Settings page) when layout data reloads.
  $effect(() => {
    engineId = engine;
  });

  // Persist the engine choice (fire-and-forget) so it sticks on next load.
  function persistEngine() {
    fetch('/api/account', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ settings: { searchEngine: engineId } })
    }).catch(() => {});
  }

  function submit(e: Event) {
    e.preventDefault();
    const term = q.trim();
    if (!term) return;
    window.open(engineById(engineId).url(term), '_blank', 'noopener');
    q = '';
  }
</script>

<form class="websearch" onsubmit={submit}>
  <Icon name="globe" size={14} />
  <select bind:value={engineId} onchange={persistEngine} aria-label="Search engine" title="Search engine">
    {#each SEARCH_ENGINES as e (e.id)}
      <option value={e.id}>{e.name}</option>
    {/each}
  </select>
  <span class="divider"></span>
  <input
    bind:value={q}
    placeholder="Search the web…"
    autocomplete="off"
    spellcheck="false"
    aria-label="Search the web"
  />
</form>

<style>
  .websearch {
    display: flex; align-items: center; gap: 6px;
    background: var(--bg); border: 1px solid var(--line);
    border-radius: var(--r-md); padding: 0 9px; height: 30px;
    width: 320px; color: var(--text-mute);
    transition: border-color 0.12s;
  }
  .websearch:focus-within { border-color: var(--accent-line); }
  select {
    background: none; border: 0; outline: 0; cursor: pointer;
    font-size: 12px; color: var(--text-dim); font-weight: 540;
    max-width: 96px; flex: none;
  }
  select:hover { color: var(--text); }
  option { color: var(--text); background: var(--bg-raised); }
  .divider { width: 1px; height: 16px; background: var(--line); flex: none; }
  input {
    background: none; border: 0; outline: 0; width: 100%;
    font-size: 13px; color: var(--text);
  }
  input::placeholder { color: var(--text-mute); }

  @media (max-width: 860px) {
    /* The bookmark search takes priority on small screens. */
    .websearch { display: none; }
  }
</style>
