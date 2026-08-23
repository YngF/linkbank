<script lang="ts">
  import { onMount } from 'svelte';
  import Icon from './Icon.svelte';
  import { ui } from '$lib/client/ui.svelte';

  const SETS = {
    lower: 'abcdefghijklmnopqrstuvwxyz',
    upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    number: '0123456789',
    symbol: '!@#$%^&*()-_=+[]{};:,.?'
  };

  let open = $state(false);
  let length = $state(16);
  let lower = $state(true);
  let upper = $state(true);
  let number = $state(true);
  let symbol = $state(true);
  let password = $state('');

  // Unbiased random integer in [0, max) via rejection sampling on crypto values.
  function randInt(max: number): number {
    const arr = new Uint32Array(1);
    const limit = Math.floor(0x100000000 / max) * max;
    let x: number;
    do {
      crypto.getRandomValues(arr);
      x = arr[0];
    } while (x >= limit);
    return x % max;
  }
  const pick = (s: string) => s[randInt(s.length)];

  function generate() {
    const sets: string[] = [];
    if (lower) sets.push(SETS.lower);
    if (upper) sets.push(SETS.upper);
    if (number) sets.push(SETS.number);
    if (symbol) sets.push(SETS.symbol);
    if (!sets.length) {
      password = '';
      return;
    }
    const pool = sets.join('');
    const chars: string[] = [];
    // Guarantee at least one from each selected class (when length allows).
    if (length >= sets.length) for (const s of sets) chars.push(pick(s));
    while (chars.length < length) chars.push(pick(pool));
    // Fisher–Yates shuffle so guaranteed chars aren't stuck at the front.
    for (let i = chars.length - 1; i > 0; i--) {
      const j = randInt(i + 1);
      [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    password = chars.join('');
  }

  function persist() {
    try {
      localStorage.setItem('lb-pwgen', JSON.stringify({ length, lower, upper, number, symbol }));
    } catch {
      /* ignore */
    }
  }
  // Regenerate + persist whenever an option changes while open.
  function onOpt() {
    persist();
    generate();
  }
  function toggle() {
    open = !open;
    if (open) generate();
  }
  function copy() {
    if (!password) return;
    navigator.clipboard?.writeText(password).then(() => ui.toast('Password copied'));
  }

  const noneSelected = $derived(!(lower || upper || number || symbol));

  const poolSize = $derived(
    (lower ? SETS.lower.length : 0) +
      (upper ? SETS.upper.length : 0) +
      (number ? SETS.number.length : 0) +
      (symbol ? SETS.symbol.length : 0)
  );
  const entropy = $derived(poolSize > 0 ? Math.log2(poolSize) * length : 0);
  const strength = $derived.by(() => {
    if (entropy < 28) return { label: 'Weak', level: 1 };
    if (entropy < 36) return { label: 'Fair', level: 2 };
    if (entropy < 60) return { label: 'Good', level: 3 };
    return { label: 'Strong', level: 4 };
  });

  onMount(() => {
    try {
      const s = JSON.parse(localStorage.getItem('lb-pwgen') || 'null');
      if (s) {
        length = Math.min(64, Math.max(4, s.length ?? 16));
        lower = s.lower ?? true;
        upper = s.upper ?? true;
        number = s.number ?? true;
        symbol = s.symbol ?? true;
      }
    } catch {
      /* ignore */
    }
  });
</script>

<svelte:window
  onclick={(e) => {
    if (!(e.target as HTMLElement).closest('.pw-wrap')) open = false;
  }}
/>

<div class="pw-wrap">
  <button
    class="iconbtn"
    class:on={open}
    onclick={toggle}
    aria-label="Password generator"
    title="Password generator"
  >
    <Icon name="key" />
  </button>

  {#if open}
    <div class="pop" role="dialog" aria-label="Password generator">
      <div class="out">
        <input class="pw" readonly value={password} placeholder="Choose options…" onclick={(e) => e.currentTarget.select()} />
        <button class="ico" onclick={generate} aria-label="Regenerate" title="Regenerate"><Icon name="refresh" size={14} /></button>
        <button class="ico" onclick={copy} aria-label="Copy" title="Copy"><Icon name="copy" size={14} /></button>
      </div>

      {#if !noneSelected}
        <div class="meter" title="{Math.round(entropy)} bits of entropy">
          <div class="bar">
            {#each [1, 2, 3, 4] as seg}
              <span class="seg {seg <= strength.level ? `on l${strength.level}` : ''}"></span>
            {/each}
          </div>
          <span class="mlabel l{strength.level}">{strength.label}</span>
        </div>
      {/if}

      <label class="len">
        <span>Length</span>
        <input type="range" min="4" max="64" bind:value={length} oninput={onOpt} />
        <b>{length}</b>
      </label>

      <div class="opts">
        <label><input type="checkbox" bind:checked={lower} onchange={onOpt} /> <span>abc</span></label>
        <label><input type="checkbox" bind:checked={upper} onchange={onOpt} /> <span>ABC</span></label>
        <label><input type="checkbox" bind:checked={number} onchange={onOpt} /> <span>123</span></label>
        <label><input type="checkbox" bind:checked={symbol} onchange={onOpt} /> <span>#$&</span></label>
      </div>

      {#if noneSelected}
        <div class="warn">Select at least one character type.</div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .pw-wrap { position: relative; }
  .iconbtn {
    width: 30px; height: 30px; border-radius: var(--r-md);
    display: grid; place-items: center; color: var(--text-dim); flex: none;
    transition: background 0.12s, color 0.12s;
  }
  .iconbtn:hover { background: var(--bg-hover); color: var(--text); }
  .iconbtn.on { background: var(--accent-soft); color: var(--accent); }

  .pop {
    position: absolute; top: 38px; right: 0; width: 280px; z-index: 65;
    background: var(--bg-raised); border: 1px solid var(--line);
    border-radius: var(--r-md); box-shadow: var(--shadow); padding: 12px;
    display: flex; flex-direction: column; gap: 10px;
    animation: pop 0.1s var(--ease);
  }
  @keyframes pop { from { opacity: 0; transform: translateY(-4px); } }

  .out { display: flex; gap: 6px; }
  .pw {
    flex: 1; min-width: 0; height: 34px; padding: 0 10px;
    border-radius: var(--r-md); border: 1px solid var(--line); background: var(--bg);
    font-family: ui-monospace, monospace; font-size: 13px; color: var(--text);
  }
  .ico {
    width: 32px; height: 34px; flex: none; border-radius: var(--r-md);
    display: grid; place-items: center; color: var(--text-dim);
    border: 1px solid var(--line); background: var(--bg-raised);
  }
  .ico:hover { background: var(--bg-hover); color: var(--text); }

  .meter { display: flex; align-items: center; gap: 8px; }
  .bar { flex: 1; display: flex; gap: 3px; }
  .seg { flex: 1; height: 4px; border-radius: 2px; background: var(--line); }
  .seg.on.l1 { background: oklch(60% 0.19 22); }
  .seg.on.l2 { background: oklch(75% 0.15 75); }
  .seg.on.l3 { background: oklch(78% 0.14 120); }
  .seg.on.l4 { background: oklch(72% 0.15 150); }
  .mlabel { flex: none; font-size: 11.5px; font-weight: 560; }
  .mlabel.l1 { color: oklch(60% 0.19 22); }
  .mlabel.l2 { color: oklch(68% 0.15 75); }
  .mlabel.l3 { color: oklch(68% 0.14 120); }
  .mlabel.l4 { color: oklch(65% 0.15 150); }

  .len { display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--text-dim); }
  .len span { flex: none; }
  .len input[type='range'] { flex: 1; accent-color: var(--accent); }
  .len b { flex: none; width: 22px; text-align: right; font-variant-numeric: tabular-nums; color: var(--text); }

  .opts { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 12px; }
  .opts label { display: flex; align-items: center; gap: 7px; font-size: 13px; color: var(--text-dim); cursor: pointer; }
  .opts input { accent-color: var(--accent); }
  .opts span { font-family: ui-monospace, monospace; }

  .warn { font-size: 12px; color: oklch(62% 0.2 25); }
</style>
