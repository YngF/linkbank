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

  // API tokens
  let tokenName = $state('');
  let newToken = $state<string | null>(null);
  let busyToken = $state(false);

  function ago(iso: string | null) {
    if (!iso) return 'never used';
    return 'last used ' + iso.slice(0, 10);
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

  async function call(body: unknown) {
    const res = await fetch('/api/account', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.error ?? 'Something went wrong');
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
  <div class="page-head"><h1>Account</h1></div>

  {#if data.account}
    <div class="card">
      <div class="who">
        Signed in as <b>{data.account.username}</b>
      </div>
    </div>

    <form class="card" onsubmit={(e) => { e.preventDefault(); saveEmail(); }}>
      <h2>Email</h2>
      <p class="hint">Optional. Used only to identify your account.</p>
      <label>Email
        <input bind:value={email} type="email" placeholder="you@example.com" autocomplete="email" />
      </label>
      <div class="foot"><button class="btn primary" disabled={busyEmail}>{busyEmail ? 'Saving…' : 'Save email'}</button></div>
    </form>

    <form class="card" onsubmit={(e) => { e.preventDefault(); savePassword(); }}>
      <h2>Password</h2>
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
      <h2>Access tokens</h2>
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
  .card {
    background: var(--bg-panel); border: 1px solid var(--line); border-radius: var(--r-lg);
    padding: 18px; margin-bottom: 14px; display: flex; flex-direction: column; gap: 12px;
  }
  h2 { font-size: 14px; font-weight: 620; }
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
