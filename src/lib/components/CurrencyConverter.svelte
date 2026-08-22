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

  const codes = $derived(rates ? currencyCodes(rates) : []);
  const result = $derived(rates && amount != null ? convert(amount, from, to, rates) : null);

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
        <div class="line">
          <input class="amt" type="number" inputmode="decimal" step="any" bind:value={amount} aria-label="Amount" />
          <select bind:value={from} onchange={persist} aria-label="From currency">
            {#each codes as c (c)}<option value={c}>{c}</option>{/each}
          </select>
        </div>

        <button class="swap" onclick={swap} aria-label="Swap currencies" title="Swap">
          <Icon name="refresh" size={13} />
        </button>

        <div class="line">
          <div class="result" title={result == null ? '' : String(result)}>
            {result == null ? '—' : fmt(result)}
          </div>
          <select bind:value={to} onchange={persist} aria-label="To currency">
            {#each codes as c (c)}<option value={c}>{c}</option>{/each}
          </select>
        </div>

        <div class="foot">{currencyName(from)} → {currencyName(to)} · ECB rates {rates.date}</div>
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
    position: absolute; top: 38px; right: 0; width: 260px; z-index: 65;
    background: var(--bg-raised); border: 1px solid var(--line);
    border-radius: var(--r-md); box-shadow: var(--shadow); padding: 12px;
    display: flex; flex-direction: column; gap: 8px;
    animation: pop 0.1s var(--ease);
  }
  @keyframes pop { from { opacity: 0; transform: translateY(-4px); } }

  .msg { font-size: 12.5px; color: var(--text-mute); padding: 6px 2px; }

  .line { display: flex; gap: 8px; }
  .amt, .result {
    flex: 1; min-width: 0; height: 34px; padding: 0 10px;
    border-radius: var(--r-md); border: 1px solid var(--line); background: var(--bg);
    font-size: 14px; color: var(--text);
  }
  .amt:focus { outline: 0; border-color: var(--accent-line); }
  .result {
    display: flex; align-items: center; justify-content: flex-end;
    font-weight: 560; font-variant-numeric: tabular-nums; overflow: hidden;
  }
  select {
    height: 34px; padding: 0 6px; flex: none; width: 78px;
    border-radius: var(--r-md); border: 1px solid var(--line); background: var(--bg);
    font-size: 13px; color: var(--text); cursor: pointer;
  }
  select:focus { outline: 0; border-color: var(--accent-line); }

  .swap {
    align-self: center; width: 26px; height: 22px; border-radius: 6px;
    display: grid; place-items: center; color: var(--text-mute);
  }
  .swap:hover { background: var(--bg-hover); color: var(--text); }

  .foot {
    font-size: 11px; color: var(--text-mute); text-align: center;
    border-top: 1px solid var(--line-soft); padding-top: 8px; margin-top: 2px;
  }
</style>
