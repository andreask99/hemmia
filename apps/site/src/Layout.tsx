/** The page frame: header with navigation and language switch, main content, footer. */
import type { ReactNode } from 'react';
import { type Lang, pagePath, SITE_URL } from './content.ts';
import { GhostPose } from './ghosts.tsx';
import { FOOTER_NAV, HEADER_NAV, type ResolvedNavItem, resolveNav } from './nav.ts';

export interface LayoutProps {
  lang: Lang;
  title: string;
  description: string;
  /** Path of the same page in the other language. */
  otherPath: string;
  /** This page's slug ('' is home). */
  slug: string;
  /** Slugs of all pages in this build (links to other pages appear only when they exist). */
  existing: ReadonlySet<string>;
  css: string[];
  scripts: string[];
  /** Full width (the home page) instead of the reading column. */
  wide?: boolean;
  /** The whole <title> (the home page), instead of "<title> · Hemmia". */
  fullTitle?: string;
  /** Not a real page (404): no canonical or alternates, not indexed. */
  notFound?: boolean;
  children: ReactNode;
}

const T = {
  en: {
    skip: 'Skip to content',
    other: 'Deutsch',
    home: 'Hemmia home',
    main: 'Main navigation',
    menu: 'Menu',
    footer: 'Footer',
    locale: 'en_US',
  },
  de: {
    skip: 'Zum Inhalt',
    other: 'English',
    home: 'Hemmia Startseite',
    main: 'Hauptnavigation',
    menu: 'Menü',
    footer: 'Fußzeile',
    locale: 'de_DE',
  },
} as const;

function NavList({ items }: { items: ResolvedNavItem[] }) {
  return (
    <ul>
      {items.map((item) => (
        <li key={item.href}>
          <a href={item.href} aria-current={item.current ? 'page' : undefined}>
            {item.label}
          </a>
        </li>
      ))}
    </ul>
  );
}

export function Layout(p: LayoutProps) {
  const t = T[p.lang];
  const header = resolveNav(HEADER_NAV, p.lang, p.slug, p.existing);
  const footer = resolveNav(FOOTER_NAV, p.lang, p.slug, p.existing);
  const other: Lang = p.lang === 'en' ? 'de' : 'en';
  const self = `${SITE_URL}${pagePath(p.lang, p.slug)}`;
  const enUrl = `${SITE_URL}${pagePath('en', p.slug)}`;
  const deUrl = `${SITE_URL}${pagePath('de', p.slug)}`;
  const title = p.fullTitle ?? `${p.title} · Hemmia`;
  return (
    <html lang={p.lang}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="color-scheme" content="light dark" />
        <title>{title}</title>
        <meta name="description" content={p.description} />
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
        {p.notFound ? (
          <meta name="robots" content="noindex" />
        ) : (
          <>
            <link rel="canonical" href={self} />
            <link rel="alternate" hrefLang="en" href={enUrl} />
            <link rel="alternate" hrefLang="de" href={deUrl} />
            <link rel="alternate" hrefLang="x-default" href={enUrl} />
            <meta property="og:type" content="website" />
            <meta property="og:site_name" content="Hemmia" />
            <meta property="og:title" content={title} />
            <meta property="og:description" content={p.description} />
            <meta property="og:url" content={self} />
            <meta property="og:image" content={`${SITE_URL}/press/hemmia-icon.png`} />
            <meta property="og:image:alt" content="Hemmia" />
            <meta property="og:locale" content={t.locale} />
            <meta name="twitter:card" content="summary" />
          </>
        )}
        {p.css.map((href) => (
          <link key={href} rel="stylesheet" href={href} />
        ))}
      </head>
      <body>
        <a className="skip" href="#main">
          {t.skip}
        </a>
        <header className="site-header">
          <a href={pagePath(p.lang, '')} aria-label={t.home} className="brand">
            <GhostPose pose="wave" size={34} />
            Hemmia
          </a>
          <nav aria-label={t.main} className="nav-wide">
            <NavList items={header} />
          </nav>
          <details className="menu">
            <summary>{t.menu}</summary>
            <NavList items={header} />
          </details>
          <a href={p.otherPath} hrefLang={other} lang={other} className="lang">
            {t.other}
          </a>
        </header>
        <main id="main" className={p.wide ? 'main-wide' : undefined}>
          {p.children}
        </main>
        <footer className="site-footer">
          <nav aria-label={t.footer}>
            <NavList items={footer} />
          </nav>
          <p className="footer-ghost">
            <GhostPose pose="sleep" size={28} />© 2026 Andreas Kalkum
          </p>
        </footer>
        {p.scripts.map((src) => (
          <script key={src} type="module" src={src} />
        ))}
      </body>
    </html>
  );
}
