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
</AuthCard>
