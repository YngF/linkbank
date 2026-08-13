<script lang="ts">
  import { chipStyle } from '$lib/tagcolour';
  interface Props {
    name: string;
    hue: number;
    removable?: boolean;
    onRemove?: () => void;
    small?: boolean;
  }
  let { name, hue, removable = false, onRemove, small = false }: Props = $props();
</script>

<span class="chip" class:small style={chipStyle(hue)}>
  {name}
  {#if removable}
    <button type="button" class="rm" aria-label={`Remove ${name}`} onclick={(e) => { e.stopPropagation(); onRemove?.(); }}>×</button>
  {/if}
</span>

<style>
  .chip {
    display: inline-flex; align-items: center; gap: 4px;
    padding: 1px 8px; border-radius: 999px;
    font-size: 12px; font-weight: 560; line-height: 1.6;
    white-space: nowrap; letter-spacing: 0;
    text-transform: none; /* don't inherit the dialog label's uppercase */
  }
  .chip.small { font-size: 11px; padding: 0 7px; }
  .rm {
    display: inline-grid; place-items: center;
    width: 14px; height: 14px; border-radius: 50%;
    font-size: 13px; line-height: 1; color: #fff;
    background: rgba(255, 255, 255, 0.25);
  }
  .rm:hover { background: rgba(255, 255, 255, 0.45); }
</style>
