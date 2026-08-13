<script lang="ts">
  import { enhance } from '$app/forms';
  import AuthCard from '$lib/components/AuthCard.svelte';
  import type { ActionData, PageData } from './$types';
  let { form, data }: { form: ActionData; data: PageData } = $props();
</script>

<AuthCard title="Create your account">
  {#if !data.open}
    <div class="auth-error">Registration is closed on this instance.</div>
    <div class="auth-alt"><a href="/login">Back to sign in</a></div>
  {:else}
    <form method="POST" use:enhance class="auth-form">
      {#if form?.error}<div class="auth-error">{form.error}</div>{/if}
      {#if data.needsInvite}
        <label>Invite code
          <input name="invite" required />
        </label>
      {/if}
      <label>Username
        <input name="username" value={form && 'username' in form ? form.username : ''} autocomplete="username" required />
      </label>
      <label>Password
        <input name="password" type="password" autocomplete="new-password" required />
      </label>
      <label>Confirm password
        <input name="confirm" type="password" autocomplete="new-password" required />
      </label>
      <button class="auth-btn" type="submit">Create account</button>
    </form>
    <div class="auth-alt">Already have an account? <a href="/login">Sign in</a></div>
  {/if}
</AuthCard>
