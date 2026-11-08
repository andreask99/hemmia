/**
 * The demo: the hub's web app with a made-up family and prepared answers, answered inside the
 * page (src/demo). Built into the phone app (apps/mobile/public/demo) and servable on the
 * website, both under /demo/. `npm run build:demo`.
 */
import { renameSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/** The entry is demo.html (index.html is the hub's); it is served as /demo/index.html. */
function renameEntry(): Plugin {
  return {
    name: 'hemmia-demo-entry',
    writeBundle(options) {
      if (options.dir) renameSync(join(options.dir, 'demo.html'), join(options.dir, 'index.html'));
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), renameEntry()],
  base: '/demo/',
  // No service worker, manifest or hub icons: the demo is part of the app or the website.
  publicDir: false,
  build: {
    outDir: process.env['HEMMIA_DEMO_OUT'] ?? '../mobile/public/demo',
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: { input: 'demo.html' },
  },
  server: { host: '127.0.0.1', port: 5175, strictPort: true, open: '/demo/demo.html' },
});
