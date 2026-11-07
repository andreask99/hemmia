/**
 * Relay logging (RELAY.md §10): counts, hub ids and truncated client addresses only. Never full
 * client IPs, SNI names other than hub hosts, push tokens, handles, refs, CSRs, signatures or
 * API bodies.
 */
import { isIP } from 'node:net';
import { type Logger, pino } from 'pino';

export function createLogger(level: string): Logger {
  return pino({
    name: 'relay',
    level,
    redact: {
      paths: [
        'token',
        'handle',
        'ref',
        'csr',
        'sig',
        'signature',
        'body',
        '*.token',
        '*.handle',
        '*.ref',
        '*.csr',
        '*.body',
      ],
      censor: '[redacted]',
    },
  });
}

/** IPv4 → /24, IPv6 → /48, as text ("203.0.113.0/24"). */
export function truncateIp(ip: string): string {
  const v4 = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  if (isIP(v4) === 4) {
    const parts = v4.split('.');
    return `${parts.slice(0, 3).join('.')}.0/24`;
  }
  if (isIP(ip) === 6) {
    const full = expandIpv6(ip);
    return `${full.slice(0, 3).join(':')}::/48`;
  }
  return 'unknown';
}

function expandIpv6(ip: string): string[] {
  const [head = '', tail = ''] = ip.split('::');
  const h = head === '' ? [] : head.split(':');
  const t = tail === '' ? [] : tail.split(':');
  const missing = ip.includes('::') ? 8 - h.length - t.length : 0;
  return [...h, ...Array<string>(missing).fill('0'), ...t].map((p) => p.replace(/^0+(?=.)/, ''));
}

/** A client address as the hub should see it: IPv4-mapped IPv6 becomes IPv4. */
export function plainIp(ip: string | undefined): string {
  if (!ip) return '';
  return ip.startsWith('::ffff:') && isIP(ip.slice(7)) === 4 ? ip.slice(7) : ip;
}
