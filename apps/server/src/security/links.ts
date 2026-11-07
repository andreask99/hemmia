/**
 * Links in a user's message that kchat reads for the model (pages the user linked).
 * Owned by Claude: these URLs go to the fetcher (security/webfetch.ts, which enforces the
 * SSRF rules again). Only the user's own text is scanned; the model never picks URLs.
 *
 * - http(s) links and bare `www.` links (read as https).
 * - Not inside code (fenced blocks or `inline`): pasted logs and config are full of links
 *   nobody asked to read.
 * - Trailing punctuation and unbalanced closing brackets are dropped (Markdown links,
 *   sentences ending in a link).
 * - Host names must look public (a dot and a letter TLD, or a public IP literal); local
 *   names and home-network addresses are skipped silently. No credentials, only the
 *   default ports. Deduplicated, at most MAX_LINKS_PER_MESSAGE.
 */
import { MAX_LINKS_PER_MESSAGE } from '@hemmia/shared';
import { isIP } from 'node:net';
import { isPublicAddress } from './webfetch.ts';

const MAX_URL_CHARS = 2000;
/** Linear: one character class, no nested quantifiers. */
const CANDIDATE = /\b(?:https?:\/\/|www\.)[^\s<>"'`]+/gi;
const TRAILING = new Set(['.', ',', ';', ':', '!', '?', '*', '_', '~', '…']);
const PAIRS: Record<string, string> = { ')': '(', ']': '[', '}': '{' };
/** Reserved or local-only top-level names (RFC 2606, 6761, 6762, home routers, tailnets). */
const LOCAL_SUFFIXES = [
  '.localhost',
  '.local',
  '.internal',
  '.lan',
  '.home',
  '.home.arpa',
  '.arpa',
  '.test',
  '.invalid',
  '.example',
  '.ts.net',
  '.fritz.box',
  '.box',
  '.corp',
];

/** The text without fenced code blocks and inline code (replaced by spaces). */
function withoutCode(text: string): string {
  let out = '';
  let i = 0;
  while (i < text.length) {
    if (text.startsWith('```', i) || text.startsWith('~~~', i)) {
      const fence = text.slice(i, i + 3);
      const close = text.indexOf(fence, i + 3);
      const end = close === -1 ? text.length : close + 3;
      out += ' '.repeat(end - i);
      i = end;
    } else if (text[i] === '`') {
      const close = text.indexOf('`', i + 1);
      const newline = text.indexOf('\n', i + 1);
      // Inline code ends on the same line; a lone backtick is just a character.
      if (close !== -1 && (newline === -1 || close < newline)) {
        out += ' '.repeat(close + 1 - i);
        i = close + 1;
      } else {
        out += '`';
        i++;
      }
    } else {
      // Up to the next backtick or tilde fence (both handled above, so stop > i).
      const tick = text.indexOf('`', i);
      const tilde = text.indexOf('~~~', i);
      const stop = Math.min(tick === -1 ? text.length : tick, tilde === -1 ? text.length : tilde);
      out += text.slice(i, stop);
      i = stop;
    }
  }
  return out;
}

/** Drops trailing punctuation and closing brackets that don't close anything in the link. */
function trimEnd(raw: string): string {
  let s = raw;
  for (;;) {
    const last = s.at(-1);
    if (last === undefined) return s;
    if (TRAILING.has(last)) {
      s = s.slice(0, -1);
      continue;
    }
    const open = PAIRS[last];
    if (open !== undefined) {
      let balance = 0;
      for (const ch of s) {
        if (ch === open) balance++;
        else if (ch === last) balance--;
      }
      if (balance < 0) {
        s = s.slice(0, -1);
        continue;
      }
    }
    return s;
  }
}

function publicLooking(host: string): boolean {
  const bare = host.replace(/^\[|\]$/g, '');
  if (isIP(bare) !== 0) return isPublicAddress(bare);
  const lower = bare.toLowerCase().replace(/\.$/, '');
  if (!lower.includes('.')) return false;
  if (LOCAL_SUFFIXES.some((s) => lower.endsWith(s) || lower === s.slice(1))) return false;
  const tld = lower.slice(lower.lastIndexOf('.') + 1);
  // Letters, or punycode (xn--) for internationalised top-level domains.
  return /^(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/.test(tld);
}

/** The links in a user's message that kchat should read, normalised, in order. */
export function findLinks(text: string): string[] {
  const found: string[] = [];
  for (const match of withoutCode(text).matchAll(CANDIDATE)) {
    if (found.length >= MAX_LINKS_PER_MESSAGE) break;
    // [https://a.example](https://a.example): the link text ends at "](".
    const bracket = match[0].indexOf('](');
    const raw = trimEnd(bracket === -1 ? match[0] : match[0].slice(0, bracket));
    if (raw.length > MAX_URL_CHARS) continue;
    let url: URL;
    try {
      url = new URL(/^www\./i.test(raw) ? `https://${raw}` : raw);
    } catch {
      continue;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') continue;
    if (url.username || url.password || url.port !== '') continue;
    if (!publicLooking(url.hostname)) continue;
    url.hash = '';
    if (!found.includes(url.href)) found.push(url.href);
  }
  return found;
}
