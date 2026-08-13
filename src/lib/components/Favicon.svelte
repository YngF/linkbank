<script lang="ts">
  import { ui } from '$lib/client/ui.svelte';
  interface Props {
    url: string;
    title: string;
  }
  let { url, title }: Props = $props();

  // Colored-initial fallback (also shown while the real icon loads / on failure).
  const info = $derived.by(() => {
    let host = title;
    try {
      host = new URL(url).hostname.replace(/^www\./, '');
    } catch {
      /* keep */
    }
    let h = 0;
    for (const c of host) h = (h * 31 + c.charCodeAt(0)) % 360;
    return {
      host,
      letter: (host[0] ?? '?').toUpperCase(),
      bg: `linear-gradient(150deg, oklch(62% .17 ${h}), oklch(52% .19 ${(h + 42) % 360}))`
    };
  });

  // The version token busts browser cache after a manual icon change.
  const src = $derived(
    `/favicon?u=${encodeURIComponent(url)}${ui.faviconVersion ? `&v=${ui.faviconVersion}` : ''}`
  );
  let state = $state<'loading' | 'ok' | 'fail'>('loading');
  // Reset when the url changes.
  $effect(() => {
    src;
    state = 'loading';
  });
</script>

<div class="fav" class:has-icon={state === 'ok'}>
  {#if state !== 'fail'}
    <img
      {src}
      alt=""
      loading="lazy"
      onload={() => (state = 'ok')}
      onerror={() => (state = 'fail')}
    />
  {/if}
  {#if state !== 'ok'}
    <span class="letter" style="background: {info.bg}">{info.letter}</span>
  {/if}
</div>

<style>
  .fav {
    position: relative;
    width: 54px;
    height: 54px;
    border-radius: 13px;
    overflow: hidden;
    display: grid;
    place-items: center;
    box-shadow: 0 1px 2px rgb(0 0 0 / 0.18), 0 6px 16px rgb(0 0 0 / 0.14);
  }
  /* Real icons sit centered on a neutral card, launcher-style. */
  .fav.has-icon {
    background: var(--bg-raised);
    border: 1px solid var(--line-soft);
  }
  img {
    width: 32px;
    height: 32px;
    object-fit: contain;
    display: block;
  }
  /* while loading, keep the image invisible so we don't flash a broken box */
  .fav:not(.has-icon) img {
    position: absolute;
    opacity: 0;
    width: 1px;
    height: 1px;
  }
  .letter {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    color: #fff;
    font-size: 21px;
    font-weight: 680;
    letter-spacing: -0.02em;
  }
</style>
