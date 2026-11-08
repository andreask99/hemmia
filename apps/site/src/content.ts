/**
 * Content files (WEBSITE.md §2): Markdown with a small fixed header block, validated with zod.
 *   ---
 *   title: …
 *   description: …
 *   nav: guides
 *   order: 20
 *   ---
 */
import { z } from 'zod';

export const LANGS = ['en', 'de'] as const;
export type Lang = (typeof LANGS)[number];

export const Header = z
  .object({
    title: z.string().min(1).max(120),
    description: z.string().min(1).max(300),
    nav: z.enum([
      'home',
      'how',
      'privacy',
      'guides',
      'download',
      'help',
      'faq',
      'news',
      'press',
      'legal',
      'start',
    ]),
    order: z.coerce.number().int().min(0).max(1000),
    draft: z.enum(['true', 'false']).default('false'),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
  })
  .strict();
export type Header = z.infer<typeof Header>;

export class ContentError extends Error {
  override name = 'ContentError';
}

/** Splits a content file into its validated header and the Markdown body. */
export function parseContent(text: string, file = 'content'): { header: Header; body: string } {
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  if (!m) throw new ContentError(`${file}: missing header block`);
  const fields: Record<string, string> = {};
  for (const line of (m[1] ?? '').split('\n')) {
    if (line.trim() === '') continue;
    const i = line.indexOf(':');
    if (i < 1) throw new ContentError(`${file}: bad header line`);
    fields[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  const parsed = Header.safeParse(fields);
  if (!parsed.success) {
    const names = parsed.error.issues.map((x) => x.path.join('.') || x.message).join(', ');
    throw new ContentError(`${file}: invalid header (${names})`);
  }
  return { header: parsed.data, body: text.slice(m[0].length) };
}

export interface Page {
  lang: Lang;
  /** '' for the home page, else e.g. 'guides/mac' (no slashes at the ends). */
  slug: string;
  header: Header;
  body: string;
}

/** The URL path of a page: /…/ for English, /de/…/ for German. */
/** The site's address, for canonical, alternate and social links. */
export const SITE_URL = 'https://hemmia.app';

export function pagePath(lang: Lang, slug: string): string {
  const base = lang === 'en' ? '/' : '/de/';
  return slug === '' ? base : `${base}${slug}/`;
}
