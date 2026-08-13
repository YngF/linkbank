<script lang="ts">
  import { enhance } from '$app/forms';
  import AuthCard from '$lib/components/AuthCard.svelte';
  import type { ActionData } from './$types';
  let { form }: { form: ActionData } = $props();
</script>

<AuthCard title="Welcome — set up your admin account" subtitle="This is a one-time step for a fresh instance.">
  <form method="POST" use:enhance class="auth-form">
    {#if form?.error}<div class="auth-error">{form.error}</div>{/if}
    <label>Username
      <input name="username" value={form?.username ?? 'yngvef'} autocomplete="username" required />
    </label>
    <label>Password
      <input name="password" type="password" autocomplete="new-password" required />
    </label>
    <label>Confirm password
      <input name="confirm" type="password" autocomplete="new-password" required />
    </label>
    <button class="auth-btn" type="submit">Create admin & sign in</button>
  </form>
</AuthCard>
