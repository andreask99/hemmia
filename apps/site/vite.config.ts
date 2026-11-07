import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// The client build produces only the CSS and the small enhancement script; pages are
// prerendered by scripts/prerender.ts (WEBSITE.md §2).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: 'dist',
    manifest: true,
    sourcemap: false,
    rollupOptions: { input: { client: 'src/client.ts' } },
  },
  server: { host: '127.0.0.1', port: 5180, strictPort: true },
  preview: { host: '127.0.0.1', port: 4320, strictPort: true },
});
