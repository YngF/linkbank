<script lang="ts">
  import { onMount } from 'svelte';
  import Icon from './Icon.svelte';
  import { currencyCodes, currencyName, convert, type Rates } from '$lib/currency';

  let open = $state(false);
  let rates = $state<Rates | null>(null);
  let loadState = $state<'idle' | 'loading' | 'error'>('idle');
  let amount = $state<number | null>(1);
  let from = $state('EUR');
  let to = $state('USD');
  let loaded = false;
  let favorites = $state<{ from: string; to: string }[]>([]);

  const codes = $derived(rates ? currencyCodes(rates) : []);
  const result = $derived(rates && amount != null ? convert(amount, from, to, rates) : null);
  const isFav = $derived(favorites.some((f) => f.from === from && f.to === to));

  async function load() {
    if (loaded) return;
    loaded = true;
    loadState = 'loading';
    try {
      const res = await fetch('/api/rates');
      if (!res.ok) throw new Error();
      rates = (await res.json()) as Rates;
      loadState = 'idle';
      const cs = currencyCodes(rates);
      if (!cs.includes(from)) from = rates.base;
      if (!cs.includes(to)) to = cs.find((c) => c !== from) ?? rates.base;
    } catch {
      loadState = 'error';
    }
  }

  function toggle() {
    open = !open;
    if (open) load();
  }
  function persist() {
    try {
      localStorage.setItem('lb-currency', JSON.stringify({ from, to }));
    } catch {
      /* ignore */
    }
  }
  function swap() {
    [from, to] = [to, from];
    persist();
  }

  function persistFavs() {
    try {
      localStorage.setItem('lb-currency-favs', JSON.stringify(favorites));
    } catch {
      /* ignore */
    }
  }
  function toggleFav() {
    favorites = isFav
      ? favorites.filter((f) => !(f.from === from && f.to === to))
      : [{ from, to }, ...favorites].slice(0, 8);
    persistFavs();
  }
  function selectFav(f: { from: string; to: string }) {
    from = f.from;
    to = f.to;
    persist();
  }
  function removeFav(f: { from: string; to: string }) {
    favorites = favorites.filter((x) => !(x.from === f.from && x.to === f.to));
    persistFavs();
  }

  onMount(() => {
    try {
      const s = JSON.parse(localStorage.getItem('lb-currency') || 'null');
      if (s?.from && s?.to) {
        from = s.from;
        to = s.to;
      }
    } catch {
      /* ignore */
    }
    try {
      const f = JSON.parse(localStorage.getItem('lb-currency-favs') || 'null');
      if (Array.isArray(f)) {
        favorites = f
          .filter((x) => x && typeof x.from === 'string' && typeof x.to === 'string')
          .slice(0, 8);
      }
    } catch {
      /* ignore */
    }
  });

  const fmt = (n: number) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 4 }).format(n);
</script>

<svelte:window
  onclick={(e) => {
    if (!(e.target as HTMLElement).closest('.cur-wrap')) open = false;
  }}
/>

<div class="cur-wrap">
  <button
    class="iconbtn"
    class:on={open}
    onclick={toggle}
    aria-label="Currency converter"
    title="Currency converter"
  >
    <Icon name="coins" />
  </button>

  {#if open}
    <div class="pop" role="dialog" aria-label="Currency converter">
      {#if loadState === 'loading'}
        <div class="msg">Loading rates…</div>
      {:else if loadState === 'error' || !rates}
        <div class="msg">Rates aren’t available right now. An admin can refresh them in Modules.</div>
      {:else}
        {#if favorites.length}
          <div class="favs">
            {#each favorites as f (f.from + '_' + f.to)}
              <div class="chip" class:active={f.from === from && f.to === to}>
                <button class="chip-btn" onclick={() => selectFav(f)} title="{f.from} → {f.to}">{f.from}→{f.to}</button>
                <button
                  class="chip-x"
                  onclick={(e) => {
                    e.stopPropagation();
                    removeFav(f);
                  }}
                  aria-label="Remove favorite"
                  title="Remove favorite"
                >
                  <Icon name="x" size={9} />
                </button>
              </div>
            {/each}
          </div>
        {/if}

        <div class="line">
          <input class="amt" type="number" inputmode="decimal" step="any" bind:value={amount} aria-label="Amount" />
          <select bind:value={from} onchange={persist} aria-label="From currency">
            {#each codes as c (c)}<option value={c}>{currencyName(c)} - {c}</option>{/each}
          </select>
        </div>

        <div class="mid">
          <button class="swap" onclick={swap} aria-label="Swap currencies" title="Swap">
            <Icon name="refresh" size={13} />
          </button>
          <button
            class="star"
            class:on={isFav}
            onclick={toggleFav}
            aria-label={isFav ? 'Remove from favorites' : 'Save as favorite'}
            title={isFav ? 'Remove from favorites' : 'Save as favorite'}
          >
            <Icon name="star" size={13} filled={isFav} />
          </button>
        </div>

        <div class="line">
          <div class="result" title={result == null ? '' : String(result)}>
            {result == null ? '—' : fmt(result)}
          </div>
          <select bind:value={to} onchange={persist} aria-label="To currency">
            {#each codes as c (c)}<option value={c}>{currencyName(c)} - {c}</option>{/each}
          </select>
        </div>

        <div class="foot">{currencyName(from)} → {currencyName(to)} · rates as of {rates.date}</div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .cur-wrap { position: relative; }
  .iconbtn {
    width: 30px; height: 30px; border-radius: var(--r-md);
    display: grid; place-items: center; color: var(--text-dim); flex: none;
    transition: background 0.12s, color 0.12s;
  }
  .iconbtn:hover { background: var(--bg-hover); color: var(--text); }
  .iconbtn.on { background: var(--accent-soft); color: var(--accent); }

  .pop {
    position: absolute; top: 38px; right: 0; width: 320px; z-index: 65;
    background: var(--bg-raised); border: 1px solid var(--line);
    border-radius: var(--r-md); box-shadow: var(--shadow); padding: 12px;
    display: flex; flex-direction: column; gap: 8px;
    animation: pop 0.1s var(--ease);
  }
  @keyframes pop { from { opacity: 0; transform: translateY(-4px); } }

  .msg { font-size: 12.5px; color: var(--text-mute); padding: 6px 2px; }

  .line { display: flex; gap: 8px; }
  .amt, .result {
    flex: none; width: 92px; min-width: 0; height: 34px; padding: 0 10px;
    border-radius: var(--r-md); border: 1px solid var(--line); background: var(--bg);
    font-size: 14px; color: var(--text);
  }
  .amt:focus { outline: 0; border-color: var(--accent-line); }
  .result {
    display: flex; align-items: center; justify-content: flex-end;
    font-weight: 560; font-variant-numeric: tabular-nums; overflow: hidden;
  }
  select {
    height: 34px; padding: 0 6px; flex: 1; min-width: 0;
    border-radius: var(--r-md); border: 1px solid var(--line); background: var(--bg);
    font-size: 13px; color: var(--text); cursor: pointer;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  select:focus { outline: 0; border-color: var(--accent-line); }

  .mid { display: flex; align-items: center; justify-content: center; gap: 10px; }
  .swap {
    width: 26px; height: 22px; border-radius: 6px;
    display: grid; place-items: center; color: var(--text-mute);
  }
  .swap:hover { background: var(--bg-hover); color: var(--text); }

  .star {
    width: 26px; height: 22px; border-radius: 6px;
    display: grid; place-items: center; color: var(--text-mute);
  }
  .star:hover { background: var(--bg-hover); color: var(--text); }
  .star.on { color: oklch(78% 0.14 90); }

  .favs { display: flex; flex-wrap: wrap; gap: 5px; }
  .chip {
    display: flex; align-items: center; gap: 2px; padding-left: 2px;
    border-radius: 999px; background: var(--bg); border: 1px solid var(--line);
  }
  .chip.active { background: var(--accent-soft); border-color: var(--accent-line); }
  .chip-btn {
    padding: 3px 2px 3px 6px; font-size: 11px; font-family: ui-monospace, monospace;
    color: var(--text-dim); white-space: nowrap;
  }
  .chip.active .chip-btn { color: var(--accent); }
  .chip-x {
    width: 16px; height: 16px; margin-right: 3px; border-radius: 50%;
    display: grid; place-items: center; color: var(--text-mute); flex: none;
  }
  .chip-x:hover { background: color-mix(in oklch, oklch(66% 0.19 22) 16%, transparent); color: oklch(60% 0.19 22); }

  .foot {
    font-size: 11px; color: var(--text-mute); text-align: center;
    border-top: 1px solid var(--line-soft); padding-top: 8px; margin-top: 2px;
  }
</style>
