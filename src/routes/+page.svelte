<script lang="ts">
  import FolderView from '$lib/components/FolderView.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

<FolderView
  title={data.title}
  branchId={data.rootId}
  crumbs={data.rootId ? [{ id: data.rootId, name: data.title }] : []}
  folders={data.folders}
  bookmarks={data.bookmarks}
  listView={data.settings.bookmarkView === 'list'}
/>
