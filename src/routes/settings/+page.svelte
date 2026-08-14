<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { ui } from '$lib/client/ui.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  let email = $state(data.account?.email ?? '');
  let curPw = $state('');
  let newPw = $state('');
  let confirmPw = $state('');
  let busyEmail = $state(false);
  let busyPw = $state(false);

  // Personalization
  let landOnLast = $state(data.settings.landOnLastFolder);
  let busyLand = $state(false);

  // Background image
  let bgBusy = $state(false);
  let bgInput = $state<HTMLInputElement | null>(null);

  async function uploadBackground(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // allow re-selecting the same file
    if (!file) return;
    if (file.size > 8_000_000) {
      ui.toast('Image too large (max 8 MB)', 'error');
      return;
    }
    bgBusy = true;
    try {
      const res = await fetch('/background', {
        method: 'POST',
        headers: { 'content-type': file.type || 'application/octet-stream' },
        body: file
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? 'Upload failed');
      ui.toast('Background updated');
      await invalidateAll();
    } catch (e) {
      ui.toast(e instanceof Error ? e.message : 'Upload failed', 'error');
    }
    bgBusy = false;
  }

  async function removeBackground() {
    bgBusy = true;
    try {
      await fetch('/background', { method: 'DELETE' });
      ui.toast('Background removed');
      await invalidateAll();
    } catch {
      ui.toast('Failed', 'error');
    }
    bgBusy = false;
  }

  // API tokens
  let tokenName = $state('');
  let newToken = $state<string | null>(null);
  let busyToken = $state(false);

  function ago(iso: string | null) {
    if (!iso) return 'never used';
    return 'last used ' + iso.slice(0, 10);
  }

  async function call(body: unknown) {
    const res = await fetch('/api/account', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.error ?? 'Something went wrong');
  }

  async function toggleLand() {
    if (busyLand) return;
    const next = !landOnLast;
    landOnLast = next; // optimistic
    busyLand = true;
    try {
      await call({ settings: { landOnLastFolder: next } });
      ui.toast(next ? 'Will open your last folder on launch' : 'Will open the top level on launch');
    } catch (e) {
      landOnLast = !next; // revert
      ui.toast(e instanceof Error ? e.message : 'Failed', 'error');
    }
    busyLand = false;
  }

  async function createToken() {
    busyToken = true;
    newToken = null;
    try {
      const res = await fetch('/api/account/tokens', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: tokenName || 'Browser extension' })
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? 'Failed');
      newToken = d.token;
      tokenName = '';
      await invalidateAll();
    } catch (e) {
      ui.toast(e instanceof Error ? e.message : 'Failed', 'error');
    }
    busyToken = false;
  }

  async function revokeToken(id: number) {
    try {
      await fetch(`/api/account/tokens/${id}`, { method: 'DELETE' });
      await invalidateAll();
      ui.toast('Token revoked');
    } catch {
      ui.toast('Failed', 'error');
    }
  }

  function copyToken() {
    if (newToken) navigator.clipboard?.writeText(newToken).then(() => ui.toast('Token copied'));
  }

  async function saveEmail() {
    busyEmail = true;
    try {
      await call({ email });
      ui.toast('Email saved');
    } catch (e) {
      ui.toast(e instanceof Error ? e.message : 'Failed', 'error');
    }
    busyEmail = false;
  }

  async function savePassword() {
    if (newPw !== confirmPw) {
      ui.toast('New passwords do not match', 'error');
      return;
    }
    busyPw = true;
    try {
      await call({ currentPassword: curPw, newPassword: newPw });
      ui.toast('Password changed');
      curPw = newPw = confirmPw = '';
    } catch (e) {
      ui.toast(e instanceof Error ? e.message : 'Failed', 'error');
    }
    busyPw = false;
  }
</script>

<div class="main-inner">
  <div class="page-head"><h1>Settings</h1></div>

  {#if data.account}
    <h2 class="section">Personalization</h2>
    <div class="card">
      <button
        type="button"
        class="toggle-row"
        role="switch"
        aria-checked={landOnLast}
        disabled={busyLand}
        onclick={toggleLand}
      >
        <span class="toggle-text">
          <b>Open my last folder on launch</b>
          <span class="hint">When you open LinkBank, jump to the folder you were last in (per browser) instead of the top level.</span>
        </span>
        <span class="switch" class:on={landOnLast} aria-hidden="true"><span class="knob"></span></span>
      </button>
    </div>

    <div class="card">
      <h3>Background image</h3>
      <p class="hint">Show your own image behind the folder tree and bookmarks. The
        tree is frosted so it stays readable. PNG, JPG, GIF or WebP, up to 8&nbsp;MB.</p>

      {#if data.bgVersion}
        <div class="bg-preview" style="background-image: url(/background?v={encodeURIComponent(data.bgVersion)})"></div>
      {/if}

      <input
        bind:this={bgInput}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        style="display:none"
        onchange={uploadBackground}
      />
      <div class="bg-actions">
        <button class="btn primary" onclick={() => bgInput?.click()} disabled={bgBusy}>
          {bgBusy ? 'Working…' : data.bgVersion ? 'Replace image' : 'Choose image'}
        </button>
        {#if data.bgVersion}
          <button class="btn danger" onclick={removeBackground} disabled={bgBusy}>Remove</button>
        {/if}
      </div>
    </div>

    <h2 class="section">Account</h2>
    <div class="card">
      <div class="who">
        Signed in as <b>{data.account.username}</b>
      </div>
    </div>

    <form class="card" onsubmit={(e) => { e.preventDefault(); saveEmail(); }}>
      <h3>Email</h3>
      <p class="hint">Optional. Used only to identify your account.</p>
      <label>Email
        <input bind:value={email} type="email" placeholder="you@example.com" autocomplete="email" />
      </label>
      <div class="foot"><button class="btn primary" disabled={busyEmail}>{busyEmail ? 'Saving…' : 'Save email'}</button></div>
    </form>

    <form class="card" onsubmit={(e) => { e.preventDefault(); savePassword(); }}>
      <h3>Password</h3>
      <label>Current password
        <input bind:value={curPw} type="password" autocomplete="current-password" required />
      </label>
      <label>New password
        <input bind:value={newPw} type="password" autocomplete="new-password" required minlength="8" />
      </label>
      <label>Confirm new password
        <input bind:value={confirmPw} type="password" autocomplete="new-password" required />
      </label>
      <div class="foot"><button class="btn primary" disabled={busyPw}>{busyPw ? 'Saving…' : 'Change password'}</button></div>
    </form>

    <div class="card">
      <h3>Access tokens</h3>
      <p class="hint">For the LinkBank browser extension. Paste a token into the extension to save links straight to your Inbox.</p>

      <div class="tokrow-new">
        <input bind:value={tokenName} placeholder="Name (e.g. Brave on laptop)" />
        <button class="btn primary" onclick={createToken} disabled={busyToken}>{busyToken ? 'Creating…' : 'New token'}</button>
      </div>

      {#if newToken}
        <div class="linkbox">
          <div class="linklabel">Copy this token now — it won’t be shown again:</div>
          <div class="linkrow">
            <input readonly value={newToken} onclick={(e) => e.currentTarget.select()} />
            <button class="btn" onclick={copyToken}>Copy</button>
          </div>
        </div>
      {/if}

      {#if data.tokens.length}
        <div class="toklist">
          {#each data.tokens as t (t.id)}
            <div class="tokrow">
              <div class="tokinfo"><b>{t.name}</b><span>created {t.created_at.slice(0, 10)} · {ago(t.last_used_at)}</span></div>
              <button class="btn danger" onclick={() => revokeToken(t.id)}>Revoke</button>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .main-inner { max-width: 560px; margin: 0 auto; padding: 20px 26px 80px; }
  .page-head { margin-bottom: 16px; }
  h1 { font-size: 22px; font-weight: 640; letter-spacing: -0.02em; }
  .section {
    font-size: 11px; text-transform: uppercase; letter-spacing: 0.07em;
    color: var(--text-mute); font-weight: 640; margin: 18px 2px 8px;
  }
  .section:first-of-type { margin-top: 0; }
  .card {
    background: var(--bg-panel); border: 1px solid var(--line); border-radius: var(--r-lg);
    padding: 18px; margin-bottom: 14px; display: flex; flex-direction: column; gap: 12px;
  }
  h3 { font-size: 14px; font-weight: 620; }
  .hint { font-size: 12.5px; color: var(--text-mute); margin-top: -6px; }
  .who { font-size: 14px; color: var(--text-dim); }
  .who b { color: var(--text); }
  label { display: flex; flex-direction: column; gap: 5px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-mute); font-weight: 600; }
  input {
    background: var(--bg); border: 1px solid var(--line); border-radius: var(--r-md);
    padding: 9px 11px; font-size: 14px; outline: 0; width: 100%;
    color: var(--text); text-transform: none; letter-spacing: normal; font-weight: 400;
  }
  input:focus { border-color: var(--accent-line); }
  .foot { display: flex; justify-content: flex-end; }
  .btn { height: 34px; padding: 0 14px; border-radius: var(--r-md); font-size: 13.5px; font-weight: 540; border: 1px solid var(--line); background: var(--bg-raised); color: var(--text-dim); }
  .btn.primary { background: var(--accent); border-color: transparent; color: #fff; }
  .btn.primary:hover { filter: brightness(1.08); }
  .btn:disabled { opacity: 0.6; }
  .btn.danger:hover { background: color-mix(in oklch, oklch(66% 0.19 22) 16%, transparent); color: oklch(60% 0.19 22); border-color: color-mix(in oklch, oklch(66% 0.19 22) 40%, transparent); }

  /* Personalization toggle row */
  .toggle-row {
    display: flex; align-items: center; gap: 16px; width: 100%;
    background: none; border: 0; padding: 0; text-align: left; color: inherit; cursor: pointer;
  }
  .toggle-row:disabled { cursor: default; opacity: 0.7; }
  .toggle-text { flex: 1; display: flex; flex-direction: column; gap: 3px; }
  .toggle-text b { font-size: 14px; font-weight: 560; color: var(--text); }
  .toggle-text .hint { margin-top: 0; }
  .switch {
    flex: none; width: 40px; height: 23px; border-radius: 99px;
    background: var(--bg-active); border: 1px solid var(--line);
    position: relative; transition: background 0.15s, border-color 0.15s;
  }
  .switch.on { background: var(--accent); border-color: transparent; }
  .knob {
    position: absolute; top: 2px; left: 2px; width: 17px; height: 17px;
    border-radius: 50%; background: #fff; box-shadow: 0 1px 2px oklch(0% 0 0 / 0.3);
    transition: transform 0.15s var(--ease);
  }
  .switch.on .knob { transform: translateX(17px); }

  /* Background image */
  .bg-preview {
    height: 130px; border-radius: var(--r-md); border: 1px solid var(--line);
    background-size: cover; background-position: center; background-repeat: no-repeat;
  }
  .bg-actions { display: flex; gap: 8px; }

  .tokrow-new { display: flex; gap: 8px; }
  .tokrow-new input { flex: 1; background: var(--bg); border: 1px solid var(--line); border-radius: var(--r-md); padding: 8px 10px; font-size: 13.5px; color: var(--text); }
  .linkbox { border-top: 1px solid var(--line-soft); padding-top: 12px; }
  .linklabel { font-size: 12px; color: var(--text-mute); margin-bottom: 6px; }
  .linkrow { display: flex; gap: 8px; }
  .linkrow input { flex: 1; background: var(--bg); border: 1px solid var(--accent-line); border-radius: var(--r-md); padding: 8px 10px; font-size: 12.5px; font-family: ui-monospace, monospace; color: var(--text); }
  .toklist { display: flex; flex-direction: column; gap: 4px; }
  .tokrow { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border: 1px solid var(--line-soft); border-radius: var(--r-md); }
  .tokinfo { flex: 1; display: flex; flex-direction: column; }
  .tokinfo b { font-size: 13.5px; font-weight: 560; }
  .tokinfo span { font-size: 11.5px; color: var(--text-mute); }
</style>
