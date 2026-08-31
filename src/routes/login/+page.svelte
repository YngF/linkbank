<script lang="ts">
  import { enhance } from '$app/forms';
  import AuthCard from '$lib/components/AuthCard.svelte';
  import type { ActionData, PageData } from './$types';
  let { form, data }: { form: ActionData; data: PageData } = $props();
</script>

<AuthCard title="Sign in to LinkBank">
  <form method="POST" use:enhance class="auth-form">
    {#if form?.error}<div class="auth-error">{form.error}</div>{/if}
    <label>Username
      <!-- svelte-ignore a11y_autofocus -->
      <input name="username" value={form?.username ?? ''} autocomplete="username" autofocus required />
    </label>
    <label>Password
      <input name="password" type="password" autocomplete="current-password" required />
    </label>
    <button class="auth-btn" type="submit">Sign in</button>
  </form>
  {#if data.registrationOpen}
    <div class="auth-alt">No account? <a href="/register">Create one</a></div>
  {/if}
  <div class="self-host-note">
    This is a self-hosted LinkBank instance, not open to public use except
    through invites. If you want your own LinkBank, visit:
    <a href="https://hub.docker.com/r/yngf73/linkbank" target="_blank" rel="noopener noreferrer">
      hub.docker.com/r/yngf73/linkbank
    </a>
  </div>
  <div class="ver-line">LinkBank v{data.version}</div>
</AuthCard>

<style>
  .self-host-note {
    margin-top: 16px; padding-top: 14px; border-top: 1px solid var(--line-soft);
    font-size: 11.5px; line-height: 1.5; color: var(--text-mute); text-align: center;
  }
  .self-host-note a { color: var(--accent); }
  .ver-line {
    margin-top: 10px; font-size: 10.5px; letter-spacing: 0.02em;
    color: var(--text-mute); text-align: center; font-variant-numeric: tabular-nums;
  }
</style>
