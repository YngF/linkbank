<script lang="ts">
  import { ui } from '$lib/client/ui.svelte';

  // Clamp within the viewport, accounting for the UI zoom. Menu.x/y are true
  // viewport pixels, but this element lives inside the zoomed <html>, so a
  // `left:Npx` renders at N*zoom. We clamp in physical space (menu size ×zoom)
  // then divide by zoom so it lands exactly under the pointer.
  let el = $state<HTMLDivElement | null>(null);
  const pos = $derived.by(() => {
    if (!ui.menu) return { left: 0, top: 0 };
    const z = ui.zoom || 1;
    const vw = typeof window !== 'undefined' ? window.innerWidth : 9999;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 9999;
    const w = 220 * z,
      h = (ui.menu.items.length + 1) * 34 * z;
    const left = Math.max(4, Math.min(ui.menu.x, vw - w - 8));
    const top = Math.max(4, Math.min(ui.menu.y, vh - h - 8));
    return { left: left / z, top: top / z };
  });
</script>

<svelte:window
  onclick={() => ui.closeMenu()}
  oncontextmenu={(e) => {
    // let our own handlers open a menu; close any stray one otherwise
    if (!(e.target as HTMLElement).closest('[data-ctx]')) ui.closeMenu();
  }}
  onkeydown={(e) => e.key === 'Escape' && ui.closeMenu()}
/>

{#if ui.menu}
  <div class="menu" bind:this={el} style="left:{pos.left}px; top:{pos.top}px" role="menu">
    {#each ui.menu.items as item (item.label)}
      <button class:danger={item.danger} role="menuitem" onclick={() => { ui.closeMenu(); item.run(); }}>
        {item.label}
      </button>
    {/each}
  </div>
{/if}

<style>
  .menu {
    position: fixed;
    z-index: 60;
    min-width: 208px;
    background: var(--bg-raised);
    border: 1px solid var(--line);
    border-radius: var(--r-md);
    box-shadow: var(--shadow);
    padding: 5px;
    animation: pop 0.1s var(--ease);
  }
  @keyframes pop {
    from { opacity: 0; transform: scale(0.97) translateY(-3px); }
  }
  button {
    display: block;
    width: 100%;
    text-align: left;
    padding: 6px 9px;
    border-radius: var(--r-sm);
    font-size: 13px;
    color: var(--text-dim);
  }
  button:hover { background: var(--bg-hover); color: var(--text); }
  button.danger:hover {
    background: color-mix(in oklch, var(--bad, oklch(60% 0.2 22)) 18%, transparent);
    color: var(--bad, oklch(66% 0.19 22));
  }
</style>
