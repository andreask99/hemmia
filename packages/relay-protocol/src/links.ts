/**
 * Invite, sign-in and device links (RELAY.md §8). Browser-safe (no Node imports): used by the
 * hub, the join page, the app shell and the web app. Owned by Claude.
 *
 * - Shared link / QR: https://join.<relay-domain>/j#1~<hubHost>~<kind>~<code>
 * - Direct: https://<hubHost>/join#<kind>~<code>
 */

export type LinkKind = 'i' | 'l' | 'd';
export const LINK_KINDS: readonly LinkKind[] = ['i', 'l', 'd'];

export interface ParsedLink {
  hubHost: string;
  kind: LinkKind;
  code: string;
}

const CODE = /^[A-Za-z0-9_-]{43}$/;
const NAME = /^[a-z0-9-]{1,63}(\.[a-z0-9-]{1,63})*$/;
const HUB_ID = /^[0-9a-hjkmnp-tv-z]{12}$/;

const isKind = (k: string): k is LinkKind => (LINK_KINDS as readonly string[]).includes(k);

export interface LinkOptions {
  /** The relay domain(s) this client knows; hub hosts must be under `h.<domain>`. */
  relayDomains: readonly string[];
  /** Development: also accept `localhost` and `*.localhost` hubs (with a port). */
  allowLocal?: boolean;
}

/** A host a link may point to: a hub under a known relay, a tailnet name, or (dev) localhost. */
export function isAllowedHubHost(hostWithPort: string, options: LinkOptions): boolean {
  const lower = hostWithPort.toLowerCase();
  const [host = '', port, extra] = lower.split(':');
  if (extra !== undefined) return false;
  if (port !== undefined && !/^\d{1,5}$/.test(port)) return false;
  if (host.length > 253 || !NAME.test(host)) return false;
  if (options.allowLocal && (host === 'localhost' || host.endsWith('.localhost'))) return true;
  if (port !== undefined) return false;
  if (host.endsWith('.ts.net')) return true;
  return options.relayDomains.some((d) => {
    const suffix = `.h.${d.toLowerCase()}`;
    return host.endsWith(suffix) && HUB_ID.test(host.slice(0, -suffix.length));
  });
}

export function formatShareLink(
  relayDomain: string,
  hubHost: string,
  kind: LinkKind,
  code: string,
): string {
  return `https://join.${relayDomain}/j#1~${hubHost}~${kind}~${code}`;
}

export function formatDirectLink(hubHost: string, kind: LinkKind, code: string): string {
  const scheme = hubHost.startsWith('localhost') ? 'http' : 'https';
  return `${scheme}://${hubHost}/join#${kind}~${code}`;
}

/** The payload after `#` of a share link: `1~<hubHost>~<kind>~<code>`. */
export function parseSharePayload(payload: string, options: LinkOptions): ParsedLink | null {
  const parts = payload.split('~');
  if (parts.length !== 4 || parts[0] !== '1') return null;
  const [, hubHost = '', kind = '', code = ''] = parts;
  if (!isKind(kind) || !CODE.test(code) || !isAllowedHubHost(hubHost, options)) return null;
  return { hubHost: hubHost.toLowerCase(), kind, code };
}

/** The payload after `#` of a direct link: `<kind>~<code>`. */
export function parseDirectPayload(payload: string): { kind: LinkKind; code: string } | null {
  const parts = payload.split('~');
  if (parts.length !== 2) return null;
  const [kind = '', code = ''] = parts;
  if (!isKind(kind) || !CODE.test(code)) return null;
  return { kind, code };
}

/** Parses a share link or a direct link; null when it isn't a valid kchat link. */
export function parseLink(raw: string, options: LinkOptions): ParsedLink | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.username || url.password || url.search) return null;
  const payload = url.hash.startsWith('#') ? url.hash.slice(1) : '';
  if (payload === '') return null;
  const host = url.host.toLowerCase();
  const isJoin = options.relayDomains.some((d) => host === `join.${d.toLowerCase()}`);
  if (isJoin) {
    if (url.protocol !== 'https:' || (url.pathname !== '/j' && url.pathname !== '/')) return null;
    return parseSharePayload(payload, options);
  }
  if (url.pathname !== '/join') return null;
  const local =
    options.allowLocal === true &&
    (url.hostname === 'localhost' || url.hostname.endsWith('.localhost'));
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) return null;
  if (!isAllowedHubHost(host, options)) return null;
  const direct = parseDirectPayload(payload);
  return direct ? { hubHost: host, ...direct } : null;
}
