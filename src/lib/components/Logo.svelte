<script lang="ts">
  // The LinkBank mark: a continuous "linked S-curve" (Concept 5), white on the
  // brand blue→purple gradient. Self-contained gradient tile so it renders
  // identically everywhere (sidebar, auth screens, etc.).
  interface Props {
    size?: number;
    /** Unique gradient id — needed when several logos share a page. */
    id?: string;
  }
  let { size = 24, id = 'lb-mark' }: Props = $props();
</script>

<svg
  class="logo"
  width={size}
  height={size}
  viewBox="0 0 48 48"
  role="img"
  aria-label="LinkBank"
>
  <defs>
    <linearGradient {id} x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#4b83f0" />
      <stop offset="1" stop-color="#8659e8" />
    </linearGradient>
  </defs>
  <rect width="48" height="48" rx="11" fill="url(#{id})" />
  <g fill="none" stroke="#fff" stroke-width="4.2" stroke-linecap="round">
    <path d="M15 15h13a5 5 0 0 1 0 10h-3" />
    <path d="M33 33H20a5 5 0 0 1 0-10h3" />
  </g>
</svg>

<style>
  .logo {
    display: block;
    flex: none;
  }
</style>
