<script lang="ts">
  /** Tiny inline icon set — no icon-font dependency, no extra requests. */
  interface Props {
    name: string;
    size?: number;
  }
  let { name, size = 16 }: Props = $props();

  const paths: Record<string, string> = {
    home: 'M3 11l9-8 9 8M5 10v10h14V10',
    folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
    'folder-open': 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v1H3zM3 10h18l-2 8H5z',
    chevron: 'M9 18l6-6-6-6',
    search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-3.5-3.5',
    plus: 'M12 5v14M5 12h14',
    sun: 'M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4',
    moon: 'M20 14.5A8.5 8.5 0 1 1 9.5 4a6.8 6.8 0 0 0 10.5 10.5z',
    link: 'M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1.5 1.5M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1.5-1.5',
    logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
    trash: 'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6',
    alert: 'M10.3 4.3 1.8 18.5A2 2 0 0 0 3.5 21.5h17a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0zM12 9v4.5M12 17.5h.01',
    refresh: 'M3.5 12a8.5 8.5 0 0 1 14.5-6L21 8M21 3v5h-5M20.5 12a8.5 8.5 0 0 1-14.5 6L3 16M3 21v-5h5',
    note: 'M6 3h8l5 5v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM14 3v5h5M8 12h8M8 16h5',
    tag: 'M3 3h7l11 11-7 7L3 10V3zM7.5 7.5h.01',
    x: 'M6 6l12 12M18 6L6 18',
    check: 'M20 6L9 17l-5-5',
    user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM5 20a7 7 0 0 1 14 0',
    copy: 'M9 9h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V10a1 1 0 0 1 1-1zM5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1',
    shield: 'M12 3l8 3v5.5c0 4.4-3.1 7.6-8 9-4.9-1.4-8-4.6-8-9V6z',
    'eye-off': 'M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.4 5.2A9 9 0 0 1 21 12a17 17 0 0 1-2.2 3M6.2 6.2A17 17 0 0 0 3 12a9 9 0 0 0 12 4.9',
    eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
    settings: 'M5 21v-7M5 10V3M12 21v-9M12 8V3M19 21v-5M19 12V3M2 14h6M9 8h6M16 16h6',
    panel: 'M4 5h16v14H4zM9 5v14'
  };
</script>

{#if name === 'sun'}
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round">
    <circle cx="12" cy="12" r="4.5" />
    <path d={paths.sun} />
  </svg>
{:else}
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d={paths[name] ?? paths.folder} />
  </svg>
{/if}
