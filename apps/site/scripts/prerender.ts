/**
 * Prerenders every content page into dist/ (WEBSITE.md §2), plus sitemap.xml, feed.xml,
 * robots.txt and the _headers file (§8). Run after the client and SSR builds.
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(ROOT, 'dist');
const SITE_URL = process.env['SITE_URL'] ?? 'https://hemmia.app';

interface RenderModule {
  renderPage: (
    page: unknown,
    assets: { css: string[]; scripts: string[] },
    existing: ReadonlySet<string>,
    data: {
      downloads: unknown[];
      shots: Readonly<Record<string, { width: number; height: number }>>;
    },
  ) => string;
  parseDownloads: (text: string, file: string) => unknown[];
  Screenshots: { parse: (data: unknown) => Record<string, { width: number; height: number }> };
  parseContent: (
    text: string,
    file: string,
  ) => {
    header: { title: string; description: string; draft: string; date?: string };
    body: string;
  };
  pagePath: (lang: 'en' | 'de', slug: string) => string;
  LANGS: readonly ('en' | 'de')[];
}

const mod = (await import(join(ROOT, 'dist-ssr', 'render.js'))) as RenderModule;

// Assets from the client build's manifest.
const manifest = JSON.parse(readFileSync(join(DIST, '.vite', 'manifest.json'), 'utf8')) as Record<
  string,
  { file: string; css?: string[] }
>;
const client = manifest['src/client.ts'];
if (!client) throw new Error('client entry missing from the manifest');
const assets = { css: (client.css ?? []).map((c) => `/${c}`), scripts: [`/${client.file}`] };

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.md') ? [p] : [];
  });
}

const urls: string[] = [];
const news: { lang: string; path: string; title: string; date: string }[] = [];
// First collect every page, so the navigation can link only to pages that exist.
const pages: {
  lang: 'en' | 'de';
  slug: string;
  header: ReturnType<RenderModule['parseContent']>['header'];
  body: string;
}[] = [];
for (const lang of mod.LANGS) {
  const base = join(ROOT, 'content', lang);
  for (const file of walk(base)) {
    const rel = relative(base, file).replace(/\.md$/, '');
    const slug = rel === 'index' ? '' : rel.replace(/\/index$/, '');
    const { header, body } = mod.parseContent(readFileSync(file, 'utf8'), relative(ROOT, file));
    if (header.draft === 'true' && process.env.SITE_DRAFTS !== '1') continue;
    pages.push({ lang, slug, header, body });
  }
}
const downloadsFile = join(ROOT, 'content', 'downloads.json');
const downloads = mod.parseDownloads(
  readFileSync(downloadsFile, 'utf8'),
  relative(ROOT, downloadsFile),
);
const shotsFile = join(ROOT, 'content', 'screenshots.json');
const shots = mod.Screenshots.parse(JSON.parse(readFileSync(shotsFile, 'utf8')));
const existing = new Set(pages.filter((p) => p.lang === 'en').map((p) => p.slug));
for (const { lang, slug, header, body } of pages) {
  const path = mod.pagePath(lang, slug);
  const out = join(DIST, path, 'index.html');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(
    out,
    mod.renderPage({ lang, slug, header, body }, assets, existing, { downloads, shots }),
  );
  urls.push(path);
  if (slug.startsWith('news/') && header.date)
    news.push({ lang, path, title: header.title, date: header.date });
}

writeFileSync(
  join(DIST, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .sort()
    .map((u) => `  <url><loc>${SITE_URL}${u}</loc></url>`)
    .join('\n')}\n</urlset>\n`,
);
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
writeFileSync(
  join(DIST, 'feed.xml'),
  `<?xml version="1.0" encoding="utf-8"?>\n<feed xmlns="http://www.w3.org/2005/Atom">\n  <title>Hemmia news</title>\n  <id>${SITE_URL}/news/</id>\n  <updated>${news[0]?.date ?? '2026-10-23'}T00:00:00Z</updated>\n${news
    .sort((a, b) => b.date.localeCompare(a.date))
    .map(
      (n) =>
        `  <entry><title>${esc(n.title)}</title><id>${SITE_URL}${n.path}</id><link href="${SITE_URL}${n.path}"/><updated>${n.date}T00:00:00Z</updated></entry>`,
    )
    .join('\n')}\n</feed>\n`,
);
writeFileSync(
  join(DIST, 'robots.txt'),
  `User-agent: *\nAllow: /\nSitemap: ${SITE_URL}/sitemap.xml\n`,
);
writeFileSync(
  join(DIST, '_headers'),
  `/*\n  Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'\n  Referrer-Policy: no-referrer\n  X-Content-Type-Options: nosniff\n  Permissions-Policy: camera=(), microphone=(), geolocation=()\n  Strict-Transport-Security: max-age=63072000; includeSubDomains\n`,
);
const icon = join(ROOT, '..', 'relay', 'static', 'join', 'icon.svg');
if (existsSync(icon)) copyFileSync(icon, join(DIST, 'icon.svg'));
process.stdout.write(`prerendered ${String(urls.length)} pages\n`);
