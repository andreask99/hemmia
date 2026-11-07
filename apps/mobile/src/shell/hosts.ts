/**
 * Which hosts count as hubs (SECURITY.md §7): `<hub-id>.h.<relay-domain>`, tailnet names
 * (`*.ts.net`), and the local development hosts of a dev build. The same list goes to the
 * native HubLauncher as `plugins.HubLauncher.hubHosts` in capacitor.config.ts.
 */

export interface HostRules {
  relayDomain: string;
  devHosts: readonly string[];
}

const LABEL = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

/** A hub host is a lowercase hostname with an optional port, no path, user or scheme. */
export function isHubHost(hubHost: string, rules: HostRules): boolean {
  const m = /^([a-z0-9.-]{1,253})(?::([0-9]{1,5}))?$/.exec(hubHost);
  if (!m?.[1]) return false;
  const host = m[1];
  if (m[2] !== undefined) {
    const port = Number(m[2]);
    if (port < 1 || port > 65535) return false;
  }
  if (rules.devHosts.includes(host)) return true;
  if (m[2] !== undefined) return false;
  const labels = host.split('.');
  if (!labels.every((l) => LABEL.test(l))) return false;
  const relay = `.h.${rules.relayDomain}`;
  if (host.endsWith(relay)) return labels.length === rules.relayDomain.split('.').length + 2;
  return host.endsWith('.ts.net') && labels.length >= 3;
}

/** The hub's base URL (hubs, including dev hubs, are always served over https). */
export function hubUrl(hubHost: string): string {
  return `https://${hubHost}`;
}
