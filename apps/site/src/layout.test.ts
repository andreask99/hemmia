import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Lang } from './content.ts';
import { Layout } from './Layout.tsx';

function render(lang: Lang, slug: string): string {
  return renderToStaticMarkup(
    createElement(Layout, {
      lang,
      title: 'T',
      description: 'D',
      otherPath: '/',
      slug,
      existing: new Set(['', 'privacy', 'guides', 'faq']),
      css: [],
      scripts: [],
      children: 'body',
    }),
  );
}

describe('Layout', () => {
  it('links only to existing pages and marks the current one', () => {
    const html = render('en', 'guides');
    expect(html).toContain('href="/privacy/"');
    expect(html).toContain('<a href="/guides/" aria-current="page">Guides</a>');
    expect(html).not.toContain('<a href="/privacy/" aria-current');
    expect(html).not.toContain('/download/');
    expect(html).not.toContain('/how-it-works/');
    expect(html).toContain('<summary>Menu</summary>');
  });

  it('uses German paths and labels', () => {
    const html = render('de', '');
    expect(html).toContain('href="/de/privacy/"');
    expect(html).toContain('<summary>Menü</summary>');
    const footer = html.slice(html.indexOf('<footer'));
    expect(footer).toContain('href="/de/faq/"');
    expect(footer).toContain('aria-label="Fußzeile"');
  });

  it('puts the skip link before the header', () => {
    const html = render('en', '');
    expect(html.indexOf('href="#main"')).toBeGreaterThan(-1);
    expect(html.indexOf('href="#main"')).toBeLessThan(html.indexOf('<header'));
  });

  it('has a canonical, the full hreflang set and social tags', () => {
    const html = render('de', 'faq');
    expect(html).toContain('<link rel="canonical" href="https://hemmia.app/de/faq/"/>');
    expect(html).toContain('hrefLang="en" href="https://hemmia.app/faq/"');
    expect(html).toContain('hrefLang="de" href="https://hemmia.app/de/faq/"');
    expect(html).toContain('hrefLang="x-default" href="https://hemmia.app/faq/"');
    expect(html).toContain('property="og:image"');
    expect(html).toContain('content="de_DE"');
    expect(html).toContain('© 2026 Andreas Kalkum');
  });
});
