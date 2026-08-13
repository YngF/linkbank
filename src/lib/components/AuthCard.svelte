<script lang="ts">
  import Logo from './Logo.svelte';
  interface Props {
    title: string;
    subtitle?: string;
    children: import('svelte').Snippet;
  }
  let { title, subtitle, children }: Props = $props();
</script>

<div class="wrap">
  <div class="card">
    <div class="brand">
      <Logo size={26} id="lb-auth" />
      <b>LinkBank</b>
    </div>
    <h1>{title}</h1>
    {#if subtitle}<p class="sub">{subtitle}</p>{/if}
    {@render children()}
  </div>
</div>

<style>
  .wrap { min-height: calc(100dvh / var(--ui-zoom, 1)); display: grid; place-items: center; padding: 24px; background: var(--bg); }
  .card {
    width: min(400px, 100%);
    background: var(--bg-panel); border: 1px solid var(--line);
    border-radius: var(--r-lg); box-shadow: var(--shadow); padding: 26px;
  }
  .brand { display: flex; align-items: center; gap: 9px; margin-bottom: 20px; }
  .brand b { font-size: 14px; }
  h1 { font-size: 19px; font-weight: 640; letter-spacing: -0.02em; }
  .sub { color: var(--text-mute); font-size: 13px; margin-top: 5px; }

  :global(.auth-form) { display: flex; flex-direction: column; gap: 12px; margin-top: 18px; }
  :global(.auth-form label) {
    display: flex; flex-direction: column; gap: 5px;
    font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em;
    color: var(--text-mute); font-weight: 600;
  }
  :global(.auth-form input) {
    background: var(--bg); border: 1px solid var(--line); border-radius: var(--r-md);
    padding: 9px 11px; font-size: 14px; outline: 0; width: 100%;
    color: var(--text); text-transform: none; letter-spacing: normal; font-weight: 400;
  }
  :global(.auth-form input:focus) { border-color: var(--accent-line); }
  :global(.auth-btn) {
    height: 36px; border-radius: var(--r-md); font-size: 14px; font-weight: 560;
    background: var(--accent); color: #fff; border: 0; margin-top: 4px;
  }
  :global(.auth-btn:hover) { filter: brightness(1.08); }
  :global(.auth-error) {
    background: color-mix(in oklch, oklch(66% 0.19 22) 12%, transparent);
    border: 1px solid color-mix(in oklch, oklch(66% 0.19 22) 40%, transparent);
    color: oklch(55% 0.19 22); border-radius: var(--r-md);
    padding: 8px 11px; font-size: 13px;
  }
  :global(.auth-alt) { margin-top: 16px; font-size: 13px; color: var(--text-mute); text-align: center; }
  :global(.auth-alt a) { color: var(--accent); }
</style>
