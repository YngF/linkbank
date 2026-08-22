<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import Icon from '$lib/components/Icon.svelte';
  import { ui } from '$lib/client/ui.svelte';
  import { api } from '$lib/client/api';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  // invite form
  let showInvite = $state(false);
  let inviteEmail = $state('');
  let inviteNote = $state('');
  let inviteAdmin = $state(false);
  let inviteExpiry = $state(7);
  let creating = $state(false);
  let newLink = $state<string | null>(null);

  function fmt(iso: string | null) {
    if (!iso) return '—';
    return iso.slice(0, 10);
  }

  function toggleAdmin(u: PageData['users'][number]) {
    ui.openDialog({
      kind: 'confirm',
      message: u.is_admin
        ? `Revoke administrator rights from “${u.username}”?`
        : `Grant administrator rights to “${u.username}”?`,
      confirmLabel: u.is_admin ? 'Revoke admin' : 'Make admin',
      run: () => api.setUserAdmin(u.id, !u.is_admin)
    });
  }

  function removeUser(u: PageData['users'][number]) {
    ui.openDialog({
      kind: 'confirm',
      message: `Delete the account “${u.username}”? This can’t be undone.`,
      confirmLabel: 'Delete user',
      run: () => api.deleteUser(u.id)
    });
  }

  async function createInvite() {
    creating = true;
    newLink = null;
    try {
      const r = await api.createInvite({
        email: inviteEmail || undefined,
        note: inviteNote || undefined,
        isAdmin: inviteAdmin,
        expiresInDays: inviteExpiry || undefined
      });
      newLink = r.link;
      inviteEmail = inviteNote = '';
      inviteAdmin = false;
      await invalidateAll();
    } catch (e) {
      ui.toast(e instanceof Error ? e.message : 'Failed to create invite', 'error');
    }
    creating = false;
  }

  function copyLink() {
    if (newLink) navigator.clipboard?.writeText(newLink).then(() => ui.toast('Invite link copied'));
  }

  let refreshingRates = $state(false);
  async function refreshRates() {
    refreshingRates = true;
    await api.refreshRates();
    refreshingRates = false;
  }
</script>

<div class="main-inner">
  <div class="page-head">
    <h1>Users &amp; access</h1>
    <span class="spacer"></span>
    <button class="btn primary" onclick={() => { showInvite = !showInvite; newLink = null; }}>
      <Icon name="plus" size={14} /> Invite user
    </button>
  </div>

  {#if showInvite}
    <div class="card invite-form">
      <div class="row2">
        <label>Email (optional)<input bind:value={inviteEmail} type="email" placeholder="person@example.com" /></label>
        <label>Expires in (days)<input bind:value={inviteExpiry} type="number" min="0" placeholder="0 = never" /></label>
      </div>
      <label>Note (optional)<input bind:value={inviteNote} placeholder="e.g. Marketing team" /></label>
      <label class="check"><input type="checkbox" bind:checked={inviteAdmin} /> <span>Make this user an administrator</span></label>
      <div class="foot">
        <button class="btn" onclick={() => (showInvite = false)}>Close</button>
        <button class="btn primary" onclick={createInvite} disabled={creating}>{creating ? 'Creating…' : 'Create invite link'}</button>
      </div>
      {#if newLink}
        <div class="linkbox">
          <div class="linklabel">Share this link — it won’t be shown again:</div>
          <div class="linkrow">
            <input readonly value={newLink} onclick={(e) => e.currentTarget.select()} />
            <button class="btn" onclick={copyLink}>Copy</button>
          </div>
        </div>
      {/if}
    </div>
  {/if}

  <h2 class="sec">Modules</h2>
  <p class="secnote">Optional features you can install for everyone. Each user then chooses whether to show it.</p>
  <div class="list">
    {#each data.modules as m (m.id)}
      <div class="urow">
        <div class="uinfo">
          <div class="uname">
            {m.name}
            {#if m.enabled}<span class="badge admin">installed</span>{/if}
          </div>
          <div class="umeta">
            {m.description}{#if m.id === 'currency' && m.enabled} · rates as of {data.ratesDate ?? 'not fetched yet'}{/if}
          </div>
        </div>
        {#if m.id === 'currency' && m.enabled}
          <button class="btn" onclick={refreshRates} disabled={refreshingRates}>
            {refreshingRates ? 'Refreshing…' : 'Refresh rates'}
          </button>
        {/if}
        <button class="btn" onclick={() => api.setModule(m.id, !m.enabled)}>
          {m.enabled ? 'Uninstall' : 'Install'}
        </button>
      </div>
    {/each}
  </div>

  <h2 class="sec">Members</h2>
  <div class="list">
    {#each data.users as u (u.id)}
      <div class="urow">
        <div class="uinfo">
          <div class="uname">
            {u.username}
            {#if u.is_admin}<span class="badge admin">admin</span>{/if}
            {#if u.id === data.selfId}<span class="badge you">you</span>{/if}
          </div>
          <div class="umeta">
            {u.email ?? 'no email'} · {u.bookmarks} bookmark{u.bookmarks === 1 ? '' : 's'} · {u.folders} folder{u.folders === 1 ? '' : 's'} · joined {fmt(u.created_at)}
          </div>
        </div>
        <button class="btn" onclick={() => toggleAdmin(u)}>{u.is_admin ? 'Revoke admin' : 'Make admin'}</button>
        <button
          class="btn danger"
          disabled={u.id === data.selfId || u.bookmarks > 0 || u.folders > 0}
          title={u.id === data.selfId ? 'You can’t delete your own account here' : u.bookmarks > 0 || u.folders > 0 ? 'User still owns bookmarks/folders' : 'Delete user'}
          onclick={() => removeUser(u)}
        >Delete</button>
      </div>
    {/each}
  </div>

  {#if data.invites.length}
    <h2 class="sec">Invites</h2>
    <div class="list">
      {#each data.invites as inv (inv.id)}
        <div class="urow">
          <div class="uinfo">
            <div class="uname">
              {inv.email ?? 'Anyone with the link'}
              {#if inv.is_admin}<span class="badge admin">admin</span>{/if}
              {#if inv.used_at}<span class="badge used">used</span>{/if}
            </div>
            <div class="umeta">
              {inv.note ? inv.note + ' · ' : ''}
              {#if inv.used_at}redeemed by {inv.used_by_username ?? '—'} on {fmt(inv.used_at)}
              {:else}created {fmt(inv.created_at)} · {inv.expires_at ? `expires ${fmt(inv.expires_at)}` : 'no expiry'}{/if}
            </div>
          </div>
          {#if !inv.used_at}
            <button class="btn danger" onclick={() => api.revokeInvite(inv.id)}>Revoke</button>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .main-inner { max-width: 800px; margin: 0 auto; padding: 20px 26px 80px; }
  .page-head { display: flex; align-items: center; gap: 12px; margin-bottom: 18px; }
  h1 { font-size: 22px; font-weight: 640; letter-spacing: -0.02em; }
  .spacer { flex: 1; }
  .sec { font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-mute); font-weight: 700; margin: 22px 0 10px; }
  .secnote { font-size: 12.5px; color: var(--text-mute); margin: -4px 0 10px; }

  .card { background: var(--bg-panel); border: 1px solid var(--line); border-radius: var(--r-lg); padding: 16px; margin-bottom: 14px; display: flex; flex-direction: column; gap: 12px; }
  .invite-form label { display: flex; flex-direction: column; gap: 5px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-mute); font-weight: 600; }
  .invite-form input { background: var(--bg); border: 1px solid var(--line); border-radius: var(--r-md); padding: 8px 10px; font-size: 13.5px; outline: 0; color: var(--text); text-transform: none; letter-spacing: normal; font-weight: 400; }
  .invite-form input:focus { border-color: var(--accent-line); }
  .row2 { display: grid; grid-template-columns: 1fr 160px; gap: 12px; }
  .check { flex-direction: row !important; align-items: center; gap: 8px; text-transform: none !important; letter-spacing: normal !important; font-weight: 400 !important; font-size: 13px !important; color: var(--text-dim) !important; }
  .check input { width: auto; }
  .foot { display: flex; justify-content: flex-end; gap: 8px; }
  .linkbox { border-top: 1px solid var(--line-soft); padding-top: 12px; }
  .linklabel { font-size: 12px; color: var(--text-mute); margin-bottom: 6px; }
  .linkrow { display: flex; gap: 8px; }
  .linkrow input { flex: 1; background: var(--bg); border: 1px solid var(--accent-line); border-radius: var(--r-md); padding: 8px 10px; font-size: 12.5px; font-family: ui-monospace, monospace; color: var(--text); }

  .list { display: flex; flex-direction: column; gap: 4px; }
  .urow { display: flex; align-items: center; gap: 11px; padding: 10px 12px; border-radius: var(--r-md); border: 1px solid var(--line-soft); }
  .urow:hover { background: var(--bg-panel); }
  .uinfo { flex: 1; min-width: 0; }
  .uname { font-size: 14px; font-weight: 560; display: flex; align-items: center; gap: 7px; }
  .umeta { font-size: 11.5px; color: var(--text-mute); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .badge { font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 99px; text-transform: uppercase; letter-spacing: 0.04em; }
  .badge.admin { background: var(--accent-soft); color: var(--accent); }
  .badge.you { background: var(--bg-active); color: var(--text-mute); }
  .badge.used { background: var(--bg-active); color: var(--text-mute); }

  .btn { display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 11px; border-radius: var(--r-md); font-size: 13px; font-weight: 520; flex: none; border: 1px solid var(--line); background: var(--bg-raised); color: var(--text-dim); }
  .btn:hover { background: var(--bg-hover); color: var(--text); }
  .btn.primary { background: var(--accent); border-color: transparent; color: #fff; }
  .btn.primary:hover { filter: brightness(1.08); }
  .btn.danger:hover { background: color-mix(in oklch, oklch(66% 0.19 22) 16%, transparent); color: oklch(60% 0.19 22); border-color: color-mix(in oklch, oklch(66% 0.19 22) 40%, transparent); }
  .btn:disabled { opacity: 0.45; cursor: default; }
</style>
