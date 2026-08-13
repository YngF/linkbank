import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  // better-sqlite3 is a native module — keep it external to the SSR bundle.
  ssr: { external: ['better-sqlite3'] }
});
