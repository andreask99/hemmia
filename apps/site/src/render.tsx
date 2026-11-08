/** Server-side rendering of one page to static HTML (built with `vite build --ssr`). */
import { renderToStaticMarkup } from 'react-dom/server';
import { type Page, pagePath } from './content.ts';
import { Blocks, parseBlocks } from './directives.tsx';
import { DownloadCards } from './DownloadCards.tsx';
import { GhostPose } from './ghosts.tsx';
import { Home } from './Home.tsx';
import type { Download } from './downloads.ts';
import type { ShotSize } from './screenshots.ts';

/** Data files under content/ that pages render from. */
export interface SiteData {
  downloads: Download[];
  /** Screenshots that have images, with their size (content/screenshots.json). */
  shots: Readonly<Record<string, ShotSize>>;
}
import { Layout } from './Layout.tsx';

export interface RenderAssets {
  css: string[];
  scripts: string[];
}

/**
 * `existing`: the slugs of every page in this build (for the navigation); `data`: the parsed
 * data files for the download and screenshot directives.
 */
export function renderPage(
  page: Page,
  assets: RenderAssets,
  existing: ReadonlySet<string>,
  data: SiteData,
): string {
  const other = page.lang === 'en' ? 'de' : 'en';
  const html = renderToStaticMarkup(
    <Layout
      lang={page.lang}
      title={page.header.title}
      description={page.header.description}
      otherPath={pagePath(other, page.slug)}
      slug={page.slug}
      existing={existing}
      css={assets.css}
      scripts={assets.scripts}
      wide={page.slug === ''}
      {...(page.slug === '' ? { fullTitle: page.header.title } : {})}
    >
      {page.slug === '' ? (
        <Home lang={page.lang} shots={data.shots} existing={existing} />
      ) : (
        <article className="prose">
          <Blocks
            blocks={parseBlocks(page.body)}
            lang={page.lang}
            shots={data.shots}
            download={<DownloadCards items={data.downloads} lang={page.lang} />}
          />
        </article>
      )}
    </Layout>,
  );
  return `<!doctype html>${html}`;
}

/** The "page not found" page (dist/404.html): both languages, the sleeping ghost, links home. */
export function renderNotFound(assets: RenderAssets, existing: ReadonlySet<string>): string {
  const html = renderToStaticMarkup(
    <Layout
      lang="en"
      title="Page not found"
      description="This page doesn't exist."
      otherPath={pagePath('de', '')}
      slug="404"
      existing={existing}
      css={assets.css}
      scripts={[]}
      notFound
    >
      <article className="prose not-found">
        <GhostPose pose="sleep" size={140} />
        <h1>Page not found</h1>
        <p>
          This page doesn't exist (any more). <a href={pagePath('en', '')}>Go to the home page</a>
        </p>
        <p lang="de">
          Diese Seite gibt es nicht (mehr). <a href={pagePath('de', '')}>Zur Startseite</a>
        </p>
      </article>
    </Layout>,
  );
  return `<!doctype html>${html}`;
}

export { parseContent, pagePath, LANGS } from './content.ts';
export { parseDownloads } from './downloads.ts';
export { Screenshots } from './screenshots.ts';
