<script lang="ts">
  let { open = $bindable(false) }: { open: boolean } = $props();

  const groups: { title: string; items: [string, string][] }[] = [
    {
      title: 'Navigate',
      items: [
        ['↑ ↓ ← →', 'Move between tiles'],
        ['Home / End', 'First / last tile'],
        ['Enter', 'Open focused item'],
        ['type letters', 'Jump to a matching item']
      ]
    },
    {
      title: 'Select',
      items: [
        ['Space', 'Toggle selection of focused'],
        ['Shift + arrows', 'Extend selection'],
        ['Ctrl/⌘ + click', 'Add to selection'],
        ['drag on empty space', 'Marquee-select'],
        ['Ctrl/⌘ + A', 'Select all'],
        ['Esc', 'Clear selection']
      ]
    },
    {
      title: 'Act',
      items: [
        ['n', 'New bookmark'],
        ['N', 'New folder'],
        ['Delete', 'Trash the selection'],
        ['/', 'Search'],
        ['?', 'This cheat sheet']
      ]
    }
  ];
</script>

{#if open}
  <div
    class="scrim"
    role="button"
    tabindex="-1"
    onclick={(e) => e.target === e.currentTarget && (open = false)}
    onkeydown={(e) => e.key === 'Escape' && (open = false)}
  >
    <div class="sheet" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
      <div class="head"><h2>Keyboard shortcuts</h2><button class="x" onclick={() => (open = false)} aria-label="Close">×</button></div>
      <div class="cols">
        {#each groups as g (g.title)}
          <div class="col">
            <div class="gtitle">{g.title}</div>
            {#each g.items as [key, desc] (key)}
              <div class="row"><kbd>{key}</kbd><span>{desc}</span></div>
            {/each}
          </div>
        {/each}
      </div>
    </div>
  </div>
{/if}

<style>
  .scrim {
    position: fixed; inset: 0; z-index: 80;
    background: oklch(10% 0 0 / 0.55); backdrop-filter: blur(3px);
    display: flex; align-items: flex-start; justify-content: center; padding-top: 12vh;
  }
  .sheet {
    width: min(680px, 94vw);
    background: var(--bg-raised); border: 1px solid var(--line);
    border-radius: var(--r-lg); box-shadow: var(--shadow); overflow: hidden;
    animation: pop 0.13s var(--ease);
  }
  @keyframes pop { from { opacity: 0; transform: scale(0.97) translateY(-4px); } }
  .head { display: flex; align-items: center; padding: 14px 16px; border-bottom: 1px solid var(--line-soft); }
  h2 { font-size: 15px; font-weight: 600; flex: 1; }
  .x { font-size: 20px; color: var(--text-mute); width: 28px; height: 28px; border-radius: var(--r-sm); }
  .x:hover { background: var(--bg-hover); color: var(--text); }
  .cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 18px; padding: 18px; }
  .gtitle { font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.07em; color: var(--text-mute); font-weight: 700; margin-bottom: 8px; }
  .row { display: flex; align-items: center; gap: 10px; padding: 3px 0; font-size: 13px; color: var(--text-dim); }
  .row span { flex: 1; }
  kbd {
    font-size: 11px; font-family: ui-monospace, monospace; color: var(--text);
    background: var(--bg-panel); border: 1px solid var(--line); border-bottom-width: 2px;
    border-radius: 5px; padding: 2px 6px; white-space: nowrap; min-width: 44px; text-align: center;
  }
</style>
