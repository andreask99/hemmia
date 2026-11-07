/**
 * Reading a page the user linked: its title, readable text and link list for the model, or
 * why it couldn't be read. Never throws for the page's sake (only when the reply is
 * cancelled). URLs and page text are never logged.
 */
import type { WebPageReason } from '@hemmia/shared';
import type { NewWebPage } from '../db/chats.ts';
import { FetchRefusedError, fetchPage, htmlToText, pageLinks } from '../security/webfetch.ts';

export interface ReadPageOptions {
  signal: AbortSignal;
  /** Characters of page text to keep (the context clips again per model). */
  maxChars?: number;
  /** Tests: replaces the fetcher. */
  fetch?: typeof fetchPage;
}

/** Text kept per page; long terms and conditions fit, the context clips per model. */
export const PAGE_MAX_CHARS = 60_000;
const PAGE_TIMEOUT_MS = 10_000;
/** Less readable text than this: the page is built by JavaScript (or is a bare shell). */
const MIN_TEXT_CHARS = 80;
const MAX_LINKS = 40;
/** Links scanned per page; legal and contact links are listed first (often in the footer). */
const SCAN_LINKS = 300;
const LEGAL =
  /impressum|imprint|datenschutz|privacy|agb|terms|nutzungsbedingungen|widerruf|cancell?ation|cookie|kontakt|contact|legal|rechtlich|barrierefrei|accessibility|about|über uns|ueber-uns/i;

const BLOCKED = new Set(['bad_url', 'scheme', 'credentials', 'port', 'address']);

function reasonFor(err: unknown): WebPageReason {
  if (err instanceof FetchRefusedError) {
    if (BLOCKED.has(err.reason)) return 'blocked';
    if (err.reason === 'too_large') return 'too_large';
    if (err.reason === 'timeout') return 'timeout';
    if (err.reason === 'content_type') {
      return err.detail.contentType === 'application/pdf' ? 'pdf' : 'not_html';
    }
    if (err.reason === 'status') {
      const status = err.detail.status ?? 0;
      if (status === 404 || status === 410) return 'not_found';
      if (status === 401 || status === 403 || status === 429 || status === 451) return 'forbidden';
    }
    return 'error';
  }
  if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
    return 'timeout';
  }
  // DNS, connection refused or reset, TLS certificate problems.
  return 'unreachable';
}

const unreadable = (url: string, reason: WebPageReason): NewWebPage => ({
  url,
  title: '',
  status: 'unreadable',
  reason,
  text: null,
});

/** Reads one linked page (url as returned by findLinks). */
export async function readLinkedPage(url: string, options: ReadPageOptions): Promise<NewWebPage> {
  const maxChars = options.maxChars ?? PAGE_MAX_CHARS;
  let page: Awaited<ReturnType<typeof fetchPage>>;
  try {
    page = await (options.fetch ?? fetchPage)(url, {
      signal: options.signal,
      timeoutMs: PAGE_TIMEOUT_MS,
    });
  } catch (err) {
    if (options.signal.aborted) throw err;
    return unreadable(url, reasonFor(err));
  }

  const { title, text } =
    page.contentType === 'html'
      ? htmlToText(page.body, maxChars)
      : { title: '', text: page.body.slice(0, maxChars).trim() };
  if (text.length < MIN_TEXT_CHARS) return unreadable(url, 'empty');

  const all = page.contentType === 'html' ? pageLinks(page.body, page.url, SCAN_LINKS) : [];
  const isLegal = (l: { text: string; url: string }) => LEGAL.test(l.text) || LEGAL.test(l.url);
  const links = [...all.filter(isLegal), ...all.filter((l) => !isLegal(l))].slice(0, MAX_LINKS);
  const parts = [
    page.url !== url ? `(Opened as ${page.url})` : '',
    text,
    links.length > 0
      ? `Links on the page:\n${links.map((l) => `- ${l.text || '(no text)'}: ${l.url}`).join('\n')}`
      : '',
  ];
  return {
    url,
    title: title.replace(/\s+/g, ' ').trim().slice(0, 300),
    status: 'read',
    reason: null,
    text: parts.filter(Boolean).join('\n\n'),
  };
}
