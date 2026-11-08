/**
 * Checks for the built site (WEBSITE.md §2, site:check): every internal link and image exists,
 * every page exists in both languages, and no page loads anything from another site.
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

/** Pages that exist in one language only. The demo (/demo/) follows the visitor's language. */
export function missingTranslations(files: SiteFile[]): string[] {
  const pages = files
    .map((f) => f.path)
    .filter((p) => p.endsWith('index.html') && !p.startsWith('/demo/'));
  const en = new Set(pages.filter((p) => !p.startsWith('/de/')));
  const de = new Set(pages.filter((p) => p.startsWith('/de/')).map((p) => p.slice(3)));
  return [
    ...[...en].filter((p) => !de.has(p)).map((p) => `de missing: ${p}`),
    ...[...de].filter((p) => !en.has(p)).map((p) => `en missing: ${p}`),
  ];
}
