<script lang="ts">
  import { enhance } from '$app/forms';
  import AuthCard from '$lib/components/AuthCard.svelte';
  import type { ActionData, PageData } from './$types';
  let { form, data }: { form: ActionData; data: PageData } = $props();
</script>

{#if data.valid}
  <AuthCard title="Accept your invitation" subtitle={data.isAdmin ? 'You’ll be set up as an administrator.' : 'Choose a username and password to get started.'}>
    <form method="POST" use:enhance class="auth-form">
      {#if form?.error}<div class="auth-error">{form.error}</div>{/if}
      {#if data.email}<div class="invited-as">Invited as <b>{data.email}</b></div>{/if}
      <label>Username
        <!-- svelte-ignore a11y_autofocus -->
        <input name="username" value={form?.username ?? ''} autocomplete="username" autofocus required />
      </label>
      <label>Password
        <input name="password" type="password" autocomplete="new-password" required />
      </label>
      <label>Confirm password
        <input name="confirm" type="password" autocomplete="new-password" required />
      </label>
      <button class="auth-btn" type="submit">Create account</button>
    </form>
  </AuthCard>
{:else}
  <AuthCard title="Invitation not valid" subtitle="This invite link is invalid, already used, or expired.">
    <div class="auth-alt">Ask an administrator for a new invite, or <a href="/login">sign in</a>.</div>
  </AuthCard>
{/if}

<style>
  .invited-as { font-size: 13px; color: var(--text-mute); }
  .invited-as b { color: var(--text); }
</style>
