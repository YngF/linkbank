<script lang="ts">
  import { onMount } from 'svelte';
  import TagChip from './TagChip.svelte';
  import { hueFromName, dotStyle } from '$lib/tagcolour';

  // Bindable list of tag *names* the dialog will save.
  let { tags = $bindable<string[]>([]) }: { tags: string[] } = $props();

  let text = $state('');
  let all = $state<{ id: number; name: string; hue: number }[]>([]);
  let open = $state(false);
  let active = $state(0);

  onMount(async () => {
    try {
      const r = await fetch('/api/tags');
      const d = await r.json();
      all = d.tags ?? [];
    } catch {
      /* ignore */
    }
  });

  const suggestions = $derived.by(() => {
    const t = text.trim().toLowerCase();
    if (!t) return [];
    const have = new Set(tags.map((x) => x.toLowerCase()));
    return all.filter((a) => a.name.toLowerCase().includes(t) && !have.has(a.name.toLowerCase())).slice(0, 6);
  });
  const canCreate = $derived(
    text.trim().length > 0 &&
      !all.some((a) => a.name.toLowerCase() === text.trim().toLowerCase()) &&
      !tags.some((x) => x.toLowerCase() === text.trim().toLowerCase())
  );

  function hueOf(name: string) {
    return all.find((a) => a.name.toLowerCase() === name.toLowerCase())?.hue ?? hueFromName(name);
  }
  function add(name: string) {
    const n = name.trim();
    if (!n) return;
    if (!tags.some((x) => x.toLowerCase() === n.toLowerCase())) tags = [...tags, n];
    text = '';
    open = false;
    active = 0;
  }
  function removeAt(i: number) {
    tags = tags.filter((_, j) => j !== i);
  }
  function onKey(e: KeyboardEvent) {
    const opts = suggestions.length + (canCreate ? 1 : 0);
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (open && opts && active < suggestions.length) add(suggestions[active].name);
      else if (text.trim()) add(text);
    } else if (e.key === 'Backspace' && !text && tags.length) {
      removeAt(tags.length - 1);
    } else if (e.key === 'ArrowDown' && opts) {
      e.preventDefault();
      open = true;
      active = (active + 1) % opts;
    } else if (e.key === 'ArrowUp' && opts) {
      e.preventDefault();
      active = (active - 1 + opts) % opts;
    } else if (e.key === 'Escape') {
      open = false;
    }
  }
</script>

<div class="taginput">
  <div class="box" role="button" tabindex="-1" onmousedown={(e) => e.currentTarget.querySelector('input')?.focus()}>
    {#each tags as name, i (name)}
      <TagChip {name} hue={hueOf(name)} removable onRemove={() => removeAt(i)} small />
    {/each}
    <input
      bind:value={text}
      placeholder={tags.length ? '' : 'Add tags…'}
      oninput={() => { open = true; active = 0; }}
      onfocus={() => (open = true)}
      onblur={() => setTimeout(() => (open = false), 120)}
      onkeydown={onKey}
    />
  </div>

  {#if open && (suggestions.length || canCreate)}
    <div class="menu">
      {#each suggestions as s, i (s.id)}
        <button type="button" class="opt" class:cur={i === active} onmousedown={() => add(s.name)} onmouseenter={() => (active = i)}>
          <span class="dot" style={dotStyle(s.hue)}></span>{s.name}
        </button>
      {/each}
      {#if canCreate}
        <button
          type="button"
          class="opt create"
          class:cur={active === suggestions.length}
          onmousedown={() => add(text)}
          onmouseenter={() => (active = suggestions.length)}
        >
          <span class="dot" style={dotStyle(hueFromName(text.trim()))}></span>Create “{text.trim()}”
        </button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .taginput { position: relative; }
  .box {
    display: flex; flex-wrap: wrap; gap: 5px; align-items: center;
    background: var(--bg); border: 1px solid var(--line); border-radius: var(--r-md);
    padding: 6px 8px; min-height: 36px; cursor: text;
  }
  .box:focus-within { border-color: var(--accent-line); }
  input {
    flex: 1; min-width: 90px; background: none; border: 0; outline: 0;
    font-size: 13.5px; color: var(--text); text-transform: none; letter-spacing: normal; font-weight: 400;
  }
  .menu {
    position: absolute; top: calc(100% + 4px); left: 0; right: 0; z-index: 5;
    background: var(--bg-raised); border: 1px solid var(--line);
    border-radius: var(--r-md); box-shadow: var(--shadow); padding: 4px; max-height: 200px; overflow: auto;
  }
  .opt {
    display: flex; align-items: center; gap: 8px; width: 100%; text-align: left;
    padding: 6px 8px; border-radius: var(--r-sm); font-size: 13px; color: var(--text-dim);
    text-transform: none; letter-spacing: normal; font-weight: 400;
  }
  .opt.cur, .opt:hover { background: var(--bg-hover); color: var(--text); }
  .opt.create { color: var(--accent); }
  .dot { width: 10px; height: 10px; border-radius: 50%; flex: none; }
</style>
