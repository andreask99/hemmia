import type { CapacitorConfig } from '@capacitor/cli';
import { SHELL_LEVEL } from './src/shell/version.ts';

/**
 * The app shell (docs/public/ARCHITECTURE.md §3.4). A hub is opened as the bridge's server URL
 * (HubLauncher), never by navigating, so there is no allowNavigation: a link to another site
 * opens in the system browser and never gets the bridge (SECURITY.md §7). The hosts a hub may
 * have, <hub-id>.h.<relay-domain> and tailnet names, plus local development hosts when
 * HEMMIA_MOBILE_DEV_HOSTS is set at build time (e.g. "localhost,10.0.2.2"), are given to the
 * native HubLauncher as plugins.HubLauncher.hubHosts.
 */
const relayDomain = process.env['HEMMIA_RELAY_DOMAIN'] ?? 'relay.invalid';
const devHosts = (process.env['HEMMIA_MOBILE_DEV_HOSTS'] ?? '')
  .split(',')
  .map((h) => h.trim())
  .filter(Boolean);

const config: CapacitorConfig = {
  appId: process.env['HEMMIA_APP_ID'] ?? 'app.hemmia.dev',
  appName: 'Hemmia (dev)',
  webDir: 'dist',
  // The version handshake (P5.11): hubs' web app reads the shell level from the user agent.
  appendUserAgent: `HemmiaShell/${String(SHELL_LEVEL)}`,
  server: {
    // Diagnostics only (P5.1): start the bridge on a hub URL, as the app does per hub.
    ...(process.env['HEMMIA_MOBILE_SERVER_URL']
      ? { url: process.env['HEMMIA_MOBILE_SERVER_URL'] }
      : {}),
    ...(devHosts.length > 0 ? { cleartext: true } : {}),
  },
  ios: { contentInset: 'never', limitsNavigationsToAppBoundDomains: false },
  android: { allowMixedContent: false },
  // Never serve the shell from a stored path (Capacitor's live-update "deploy" feature): a hub
  // page could otherwise write files and make them the shell origin, which holds the phone-mode
  // keys (security review 2026-11-07). The native code also resets the location.
  cordova: { preferences: { DisableDeploy: 'true' } },
  plugins: {
    PushNotifications: { presentationOptions: ['alert', 'sound'] },
    HubLauncher: { hubHosts: [`*.h.${relayDomain}`, '*.ts.net', ...devHosts] },
  },
};

export default config;
