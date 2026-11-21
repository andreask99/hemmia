/**
 * Checks for the built site (WEBSITE.md §2, site:check): every internal link and image exists,
 * every page exists in every language, and no page loads anything from another site.
 */

export interface SiteFile {
  /** Path relative to dist, with a leading slash, e.g. "/de/guides/mac/index.html". */
  path: string;
  html: string;
}

const attr = (html: string, re: RegExp) => [...html.matchAll(re)].map((m) => m[1] ?? '');

/** Resource URLs a page loads from elsewhere (links in <a href> are allowed). */
export function externalResources(html: string): string[] {
  const urls = attr(
    html,
    /<(?:script|img|iframe|source|video|audio|embed)\b[^>]*\ssrc="([^"]+)"/gi,
  );
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0];
    if (!/\srel="[^"]*(stylesheet|preload|modulepreload|icon|manifest)[^"]*"/i.test(tag)) continue;
    const href = /\shref="([^"]+)"/i.exec(tag)?.[1];
    if (href) urls.push(href);
  }
  for (const set of attr(html, /\ssrcset="([^"]+)"/gi)) {
    for (const part of set.split(',')) urls.push(part.trim().split(' ')[0] ?? '');
  }
  return urls.filter((u) => /^(https?:)?\/\//i.test(u));
}

/** Internal links and image paths that point to nothing in the site. */
export function brokenLinks(files: SiteFile[], assets: Set<string>): string[] {
  const pages = new Set(files.map((f) => f.path));
  const exists = (p: string) => {
    const clean = p.split('#')[0]?.split('?')[0] ?? '';
    if (clean === '') return true;
    if (clean.endsWith('/')) return pages.has(`${clean}index.html`);
    return pages.has(clean) || assets.has(clean) || pages.has(`${clean}/index.html`);
  };
  const out: string[] = [];
  for (const f of files) {
    for (const href of [
      ...attr(f.html, /\shref="([^"]+)"/gi),
      ...attr(f.html, /\ssrc="([^"]+)"/gi),
    ]) {
      if (/^(https?:|mailto:|#)/i.test(href)) continue;
      if (href.startsWith('/') && !exists(href)) out.push(`${f.path} → ${href}`);
    }
  }
  return [...new Set(out)];
}

/** Pages missing in a language. The demo (/demo/) follows the visitor's language. */
export function missingTranslations(files: SiteFile[]): string[] {
  const OTHER = ['de', 'fr', 'it'] as const;
  const pages = files
    .map((f) => f.path)
    .filter((p) => p.endsWith('index.html') && !p.startsWith('/demo/'));
  const langOf = (p: string) => OTHER.find((l) => p.startsWith(`/${l}/`)) ?? 'en';
  const slugOf = (p: string) => (langOf(p) === 'en' ? p : p.slice(3));
  const byLang = new Map<string, Set<string>>();
  for (const p of pages) {
    const l = langOf(p);
    byLang.set(l, (byLang.get(l) ?? new Set()).add(slugOf(p)));
  }
  const all = new Set(pages.map(slugOf));
  const out: string[] = [];
  for (const l of ['en', ...OTHER]) {
    for (const slug of all) if (!byLang.get(l)?.has(slug)) out.push(`${l} missing: ${slug}`);
  }
  return out;
}
