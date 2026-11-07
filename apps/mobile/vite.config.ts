import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const relayDomain = process.env['HEMMIA_RELAY_DOMAIN'] ?? 'relay.invalid';
const devHosts = (process.env['HEMMIA_MOBILE_DEV_HOSTS'] ?? '')
  .split(',')
  .map((h) => h.trim())
  .filter(Boolean);

/** Fills the shell's connect-src (SECURITY.md §7.1) for this build's relay and dev hosts. */
function shellCsp(): Plugin {
  const extra = [
    `https://*.h.${relayDomain}`,
    ...devHosts.flatMap((h) => [`http://${h}:*`, `https://${h}:*`]),
    // Diagnostics builds (P5.1) measure streaming against a public test endpoint.
    ...(process.env['HEMMIA_MOBILE_DIAG'] ? ['https://httpbin.org'] : []),
  ].join(' ');
  return {
    name: 'kchat-shell-csp',
    transformIndexHtml: (html) => html.replaceAll('%CONNECT_EXTRA%', extra),
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), shellCsp()],
  // Relative asset paths: the shell is served from the app bundle.
  base: './',
  define: {
    __RELAY_DOMAIN__: JSON.stringify(relayDomain),
    __DEV_HOSTS__: JSON.stringify(devHosts),
    __DOWNLOAD_URL__: JSON.stringify(
      process.env['HEMMIA_DOWNLOAD_URL'] ?? 'https://github.com/hemmia/hemmia/releases/latest',
    ),
    // Store pages for "Update the app" (P5.11); the final ids come with P5.10.
    __STORE_URL_IOS__: JSON.stringify(
      process.env['HEMMIA_STORE_URL_IOS'] ?? 'https://apps.apple.com/app/hemmia',
    ),
    __STORE_URL_ANDROID__: JSON.stringify(
      process.env['HEMMIA_STORE_URL_ANDROID'] ??
        'https://play.google.com/store/apps/details?id=app.hemmia',
    ),
    __DIAG__: JSON.stringify(process.env['HEMMIA_MOBILE_DIAG'] ?? ''),
  },
  build: { sourcemap: false, outDir: 'dist' },
  server: { host: '127.0.0.1', port: 5174, strictPort: true },
});
