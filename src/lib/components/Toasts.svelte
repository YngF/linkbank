<script lang="ts">
  import { ui } from '$lib/client/ui.svelte';
</script>

<div class="toasts">
  {#each ui.toasts as t (t.id)}
    <div class="toast" class:err={t.tone === 'error'}>
      <span class="dot"></span>
      <span>{t.message}</span>
      {#if t.action}
        <button class="undo" onclick={() => { ui.dismissToast(t.id); t.action?.run(); }}>{t.action.label}</button>
      {/if}
    </div>
  {/each}
</div>

<style>
  .toasts {
    position: fixed;
    left: 50%;
    bottom: 26px;
    transform: translateX(-50%);
    z-index: 90;
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: center;
  }
  .toast {
    display: flex;
    align-items: center;
    gap: 11px;
    background: var(--bg-raised);
    border: 1px solid var(--line);
    border-radius: 99px;
    padding: 8px 16px;
    box-shadow: var(--shadow);
    font-size: 13px;
    animation: slideup 0.2s var(--ease);
  }
  @keyframes slideup {
    from { opacity: 0; transform: translateY(12px); }
  }
  .dot { width: 6px; height: 6px; border-radius: 50%; background: oklch(74% 0.15 155); flex: none; }
  .toast.err .dot { background: oklch(66% 0.19 22); }
  .undo {
    font-size: 12px; font-weight: 600; color: var(--accent);
    padding: 3px 10px; border-radius: 99px; background: var(--accent-soft); margin-left: 4px;
  }
  .undo:hover { filter: brightness(1.05); }
</style>
