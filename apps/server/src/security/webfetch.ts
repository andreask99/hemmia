/**
 * Fetching public web pages (and images, for the photo search) for the web search tool, and
 * turning HTML into plain text.
 * Owned by Claude (outbound requests from the server: SSRF protection).
 *
 * - Only http/https on the default ports, no credentials in URLs.
 * - Every address a host name resolves to must be public: no loopback, private, link-local,
 *   carrier-grade NAT (Tailscale uses 100.64.0.0/10), multicast or reserved ranges. The
 *   connection uses the address that was checked (custom lookup), so DNS rebinding between
 *   check and connect doesn't work. Redirects are followed manually and checked again.
 * - Size, time and content-type limits; HTML is parsed by a linear scanner (no regex
 *   backtracking on untrusted input).
 * - Nothing about the page (URL, content) is logged.
 */
import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import { BlockList, isIP } from 'node:net';
import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib';
import type { Readable } from 'node:stream';

const blocked = new BlockList();
for (const [net, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  blocked.addSubnet(net, prefix, 'ipv4');
}
for (const [net, prefix] of [
  ['::', 96], // unspecified, loopback and the old IPv4-compatible form (::a.b.c.d)
  ['::1', 128],
  ['64:ff9b::', 96],
  ['64:ff9b:1::', 48],
  ['100::', 64],
  ['2001::', 32],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['fc00::', 7],
  ['fe80::', 10],
  ['fec0::', 10],
  ['ff00::', 8],
] as const) {
  blocked.addSubnet(net, prefix, 'ipv6');
}

/** True for addresses on the public internet. */
export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !blocked.check(address, 'ipv4');
  if (family === 6) {
    const lower = address.toLowerCase();
    // IPv4-mapped (::ffff:a.b.c.d or ::ffff:hhhh:hhhh): judge the embedded IPv4 address.
    const mapped = /^::ffff:(?:0:)?(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
    if (mapped?.[1]) return isPublicAddress(mapped[1]);
    const hex = /^::ffff:(?:0:)?([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(lower);
    if (hex?.[1] && hex[2]) {
      const a = parseInt(hex[1], 16);
      const b = parseInt(hex[2], 16);
      return isPublicAddress(
        `${String(a >> 8)}.${String(a & 255)}.${String(b >> 8)}.${String(b & 255)}`,
      );
    }
    if (lower.startsWith('::ffff:')) return false;
    return !blocked.check(address, 'ipv6');
  }
  return false;
}

export class FetchRefusedError extends Error {
  override name = 'FetchRefusedError';
  readonly reason: string;
  /** The HTTP status (reason 'status') or content type (reason 'content_type'). */
  readonly detail: { status?: number; contentType?: string };
  constructor(reason: string, detail: { status?: number; contentType?: string } = {}) {
    super(reason);
    this.reason = reason;
    this.detail = detail;
  }
}

export interface FetchedPage {
  /** Final URL after redirects. */
  url: string;
  contentType: 'html' | 'text';
  body: string;
}

export interface FetchOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Bytes read from the network and bytes after decompression, each. */
  maxBytes?: number;
  maxRedirects?: number;
  /** Tests only: which resolved addresses may be contacted. */
  addressAllowed?: (address: string) => boolean;
  /** Tests only: which explicit ports are allowed (default: none, only 80/443). */
  portAllowed?: (port: string) => boolean;
}

const DEFAULTS = { timeoutMs: 8000, maxBytes: 2 * 1024 * 1024, maxRedirects: 3 };

function checkUrl(raw: string, portAllowed: (port: string) => boolean = () => false): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new FetchRefusedError('bad_url');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new FetchRefusedError('scheme');
  if (url.username || url.password) throw new FetchRefusedError('credentials');
  if (url.port !== '' && !portAllowed(url.port)) throw new FetchRefusedError('port');
  return url;
}

const PAGE_ACCEPT = 'text/html,application/xhtml+xml,text/plain;q=0.9';
const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp;q=0.9';
const IMAGE_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);

/**
 * GETs a public URL, following checked redirects, and reads the body within the limits if
 * `accepts` takes its content type (lower case, without parameters).
 */
async function fetchPublic(
  raw: string,
  options: FetchOptions,
  accept: string,
  accepts: (type: string) => boolean,
): Promise<{ url: string; type: string; bytes: Buffer }> {
  const opts = { ...DEFAULTS, ...options };
  const allowed = options.addressAllowed ?? isPublicAddress;
  const timeout = AbortSignal.timeout(opts.timeoutMs);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  let url = checkUrl(raw, options.portAllowed);
  for (let hop = 0; ; hop++) {
    const res = await request(url, allowed, signal, accept);
    const status = res.statusCode ?? 0;
    if (status >= 300 && status < 400 && res.headers.location) {
      res.resume();
      if (hop >= opts.maxRedirects) throw new FetchRefusedError('redirects');
      url = checkUrl(new URL(res.headers.location, url).href, options.portAllowed);
      continue;
    }
    if (status !== 200) {
      res.resume();
      throw new FetchRefusedError('status', { status });
    }
    const type = (res.headers['content-type'] ?? '').toLowerCase();
    const mime = type.split(';')[0]?.trim() ?? '';
    if (!accepts(mime)) {
      res.resume();
      throw new FetchRefusedError('content_type', { contentType: mime });
    }
    const bytes = await readLimited(res, opts.maxBytes, signal);
    return { url: url.href, type, bytes };
  }
}

/** Fetches a public web page (HTML or plain text). Throws FetchRefusedError or on network errors. */
export async function fetchPage(raw: string, options: FetchOptions = {}): Promise<FetchedPage> {
  const res = await fetchPublic(
    raw,
    options,
    PAGE_ACCEPT,
    (t) => t === 'text/html' || t === 'application/xhtml+xml' || t === 'text/plain',
  );
  const contentType = res.type.startsWith('text/plain') ? 'text' : 'html';
  return { url: res.url, contentType, body: decode(res.bytes, res.type) };
}

/**
 * Fetches a public image (JPEG, PNG or WebP by its content type) as bytes, for the photo
 * search. The bytes are untrusted: callers must validate and re-encode them
 * (attachments.saveWebPhoto). Throws FetchRefusedError or on network errors.
 */
export async function fetchImage(raw: string, options: FetchOptions = {}): Promise<Buffer> {
  return (await fetchPublic(raw, options, IMAGE_ACCEPT, (t) => IMAGE_TYPES.has(t))).bytes;
}

function request(
  url: URL,
  allowed: (address: string) => boolean,
  signal: AbortSignal,
  accept: string,
): Promise<http.IncomingMessage> {
  const host = url.hostname.replace(/^\[|\]$/g, '');
  // Node skips `lookup` for IP literals, so check those here.
  if (isIP(host) && !allowed(host)) return Promise.reject(new FetchRefusedError('address'));
  const lookup = (
    hostname: string,
    options: { all?: boolean } | number | undefined,
    callback: (
      err: NodeJS.ErrnoException | null,
      address: string | LookupAddress[],
      family?: number,
    ) => void,
  ) => {
    dnsLookup(hostname, { all: true }, (err, addresses) => {
      if (err) {
        callback(err, '');
        return;
      }
      // Any non-public answer refuses the host (a mixed answer is a rebinding attempt).
      if (addresses.length === 0 || addresses.some((a) => !allowed(a.address))) {
        callback(new FetchRefusedError('address'), '');
        return;
      }
      // Node's connect (autoSelectFamily, on by default) asks for all addresses and fails
      // with "Invalid IP address: undefined" when it gets a single one. Every address
      // handed over has been checked above.
      if (typeof options === 'object' && options.all === true) {
        callback(null, addresses);
        return;
      }
      const first = addresses[0];
      if (!first) {
        callback(new FetchRefusedError('address'), '');
        return;
      }
      callback(null, first.address, first.family);
    });
  };
  const client = url.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const req = client.request(
      url,
      {
        method: 'GET',
        lookup,
        signal,
        headers: {
          'user-agent': 'Mozilla/5.0 (compatible; Hemmia; private family assistant)',
          accept,
          'accept-language': 'de,en;q=0.8',
          'accept-encoding': 'gzip, deflate, br',
        },
      },
      resolve,
    );
    req.on('error', reject);
    req.end();
  });
}

async function readLimited(
  res: http.IncomingMessage,
  maxBytes: number,
  signal: AbortSignal,
): Promise<Buffer> {
  const encoding = (res.headers['content-encoding'] ?? '').toLowerCase().trim();
  let raw = 0;
  res.on('data', (chunk: Buffer) => {
    raw += chunk.length;
    if (raw > maxBytes) res.destroy(new FetchRefusedError('too_large'));
  });
  let stream: Readable = res;
  if (encoding === 'gzip' || encoding === 'x-gzip') stream = res.pipe(createGunzip());
  else if (encoding === 'deflate') stream = res.pipe(createInflate());
  else if (encoding === 'br') stream = res.pipe(createBrotliDecompress());
  else if (encoding !== '' && encoding !== 'identity') {
    res.destroy();
    throw new FetchRefusedError('encoding');
  }
  if (stream !== res) {
    res.on('error', (err) => stream.destroy(err));
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of stream) {
    if (signal.aborted) throw new FetchRefusedError('timeout');
    const buf = chunk as Buffer;
    size += buf.length;
    if (size > maxBytes) {
      stream.destroy();
      res.destroy();
      throw new FetchRefusedError('too_large');
    }
    chunks.push(buf);
  }
  return Buffer.concat(chunks);
}

function decode(bytes: Buffer, contentType: string): string {
  const declared =
    /charset=["']?([\w-]+)/.exec(contentType)?.[1] ??
    /<meta[^>]{0,200}charset=["']?([\w-]+)/i.exec(bytes.subarray(0, 2048).toString('latin1'))?.[1];
  try {
    return new TextDecoder(declared ?? 'utf-8').decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}

// ---------------------------------------------------------------------------
// HTML → text

const SKIP = new Set([
  'script',
  'style',
  'noscript',
  'template',
  'svg',
  'iframe',
  'object',
  'canvas',
  'head',
  'nav',
  'footer',
  'aside',
  'form',
  'button',
  'select',
]);
const BLOCK = new Set([
  'p',
  'div',
  'section',
  'article',
  'main',
  'header',
  'br',
  'hr',
  'li',
  'ul',
  'ol',
  'tr',
  'table',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'blockquote',
  'pre',
  'dd',
  'dt',
  'figcaption',
]);
/** Marks a table cell start while scanning; becomes " | " between cells. */
const CELL = '\uE000';
const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  shy: '',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  laquo: '«',
  raquo: '»',
  bdquo: '„',
  ldquo: '“',
  rdquo: '”',
  lsquo: '‘',
  rsquo: '’',
  euro: '€',
  copy: '©',
  reg: '®',
  deg: '°',
  middot: '·',
  auml: 'ä',
  ouml: 'ö',
  uuml: 'ü',
  Auml: 'Ä',
  Ouml: 'Ö',
  Uuml: 'Ü',
  szlig: 'ß',
  times: '×',
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]{1,6}|#[0-9]{1,7}|[a-z]{2,8});/gi, (all, code: string) => {
    if (code.startsWith('#')) {
      const n =
        code[1] === 'x' || code[1] === 'X'
          ? parseInt(code.slice(2), 16)
          : parseInt(code.slice(1), 10);
      return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : '';
    }
    return ENTITIES[code] ?? all;
  });
}

/** The page title and readable text (main/article content when marked up), at most `maxChars`. */
export function htmlToText(html: string, maxChars = 6000): { title: string; text: string } {
  const lower = html.toLowerCase();
  const titleStart = lower.indexOf('<title');
  let title = '';
  if (titleStart >= 0) {
    const open = lower.indexOf('>', titleStart);
    const close = lower.indexOf('</title', open);
    if (open >= 0 && close > open)
      title = decodeEntities(html.slice(open + 1, close))
        .replace(/\s+/g, ' ')
        .trim();
  }
  // Prefer the main content when the page marks it up.
  let start = 0;
  let end = html.length;
  for (const tag of ['main', 'article']) {
    const s = lower.indexOf(`<${tag}`);
    const e = lower.lastIndexOf(`</${tag}`);
    if (s >= 0 && e > s) {
      start = s;
      end = e;
      break;
    }
  }
  const out: string[] = [];
  let length = 0;
  let i = start;
  while (i < end && length < maxChars) {
    const lt = html.indexOf('<', i);
    const textEnd = lt === -1 || lt > end ? end : lt;
    if (textEnd > i) {
      const piece = html.slice(i, textEnd);
      out.push(piece);
      length += piece.length;
    }
    if (textEnd >= end) break;
    if (lower.startsWith('<!--', textEnd)) {
      const close = lower.indexOf('-->', textEnd + 4);
      i = close === -1 ? end : close + 3;
      continue;
    }
    const gt = html.indexOf('>', textEnd);
    if (gt === -1) break;
    const name =
      /^<\/?([a-z][a-z0-9]*)/.exec(lower.slice(textEnd, Math.min(gt + 1, textEnd + 20)))?.[1] ?? '';
    const closing = lower[textEnd + 1] === '/';
    i = gt + 1;
    if (!closing && SKIP.has(name) && lower[gt - 1] !== '/') {
      const close = lower.indexOf(`</${name}`, i);
      i = close === -1 ? end : lower.indexOf('>', close) + 1 || end;
      out.push('\n');
      continue;
    }
    if (BLOCK.has(name)) out.push('\n');
    else if (!closing && (name === 'td' || name === 'th')) out.push(CELL);
  }
  const text = decodeEntities(out.join(''))
    .replace(/[ \t\f\v\r\u00a0]+/g, ' ')
    .replace(/ *\n[ \n]*/g, '\n')
    .replace(/(^|\n) ?\uE000 ?/g, '$1')
    .replace(/ ?\uE000 ?/g, ' | ')
    .trim();
  return { title, text: text.length > maxChars ? `${text.slice(0, maxChars)}…` : text };
}

/**
 * Links on a page (anchor text and absolute http(s) URL), in page order, deduplicated, at
 * most `max`. Includes navigation and footer links (imprint, privacy, terms), which
 * htmlToText leaves out. Linear scan like htmlToText.
 */
export function pageLinks(
  html: string,
  baseUrl: string,
  max = 40,
): { text: string; url: string }[] {
  const lower = html.toLowerCase();
  const links: { text: string; url: string }[] = [];
  let i = 0;
  while (links.length < max) {
    const start = lower.indexOf('<a', i);
    if (start === -1) break;
    const gt = html.indexOf('>', start);
    if (gt === -1) break;
    i = gt + 1;
    const after = lower[start + 2];
    if (after !== ' ' && after !== '\n' && after !== '\t' && after !== '\r') continue;
    const tag = html.slice(start, gt);
    const href = /\shref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i.exec(tag);
    const raw = decodeEntities(href?.[1] ?? href?.[2] ?? href?.[3] ?? '').trim();
    if (raw === '' || raw.startsWith('#')) continue;
    const close = lower.indexOf('</a', i);
    const inner = close === -1 ? '' : html.slice(i, Math.min(close, i + 2000));
    if (close !== -1) i = close;
    // Anchor text without tags (alt text of a logo is lost; such links rarely matter).
    let text = '';
    let depth = 0;
    for (const ch of inner) {
      if (ch === '<') depth++;
      else if (ch === '>') depth = Math.max(0, depth - 1);
      else if (depth === 0) text += ch;
    }
    text = decodeEntities(text).replace(/\s+/g, ' ').trim().slice(0, 80);
    let url: URL;
    try {
      url = new URL(raw, baseUrl);
    } catch {
      continue;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') continue;
    url.hash = '';
    if (url.href.length > 2000 || links.some((l) => l.url === url.href)) continue;
    links.push({ text, url: url.href });
  }
  return links;
}
