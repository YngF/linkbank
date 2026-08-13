<script lang="ts">
  import FolderView from '$lib/components/FolderView.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

<FolderView
  title={data.title}
  branchId={data.crumbs.length ? data.crumbs[data.crumbs.length - 1].id : null}
  crumbs={data.crumbs}
  folders={data.folders}
  bookmarks={data.bookmarks}
/>
