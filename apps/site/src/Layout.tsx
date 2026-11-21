/** The page frame: header with navigation and language switch, main content, footer. */
import type { ReactNode } from 'react';
import { LANGS, type Lang, pagePath, SITE_URL } from './content.ts';
import { Feedback, showsFeedback } from './Feedback.tsx';
import { GhostPose } from './ghosts.tsx';
import { FOOTER_NAV, HEADER_NAV, type ResolvedNavItem, resolveNav } from './nav.ts';

export interface LayoutProps {
  lang: Lang;
  title: string;
  description: string;
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
    home: 'Hemmia home',
    main: 'Main navigation',
    menu: 'Menu',
    footer: 'Footer',
    languages: 'Language',
    locale: 'en_US',
  },
  de: {
    skip: 'Zum Inhalt',
    home: 'Hemmia Startseite',
    main: 'Hauptnavigation',
    menu: 'Menü',
    footer: 'Fußzeile',
    languages: 'Sprache',
    locale: 'de_DE',
  },
  fr: {
    skip: 'Aller au contenu',
    home: 'Accueil Hemmia',
    main: 'Navigation principale',
    menu: 'Menu',
    footer: 'Pied de page',
    languages: 'Langue',
    locale: 'fr_FR',
  },
  it: {
    skip: 'Vai al contenuto',
    home: 'Home page di Hemmia',
    main: 'Navigazione principale',
    menu: 'Menu',
    footer: 'Piè di pagina',
    languages: 'Lingua',
    locale: 'it_IT',
  },
} as const;

/** Each language in its own name, for the language switch. */
const NATIVE: Record<Lang, string> = {
  en: 'English',
  de: 'Deutsch',
  fr: 'Français',
  it: 'Italiano',
};

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
  const self = `${SITE_URL}${pagePath(p.lang, p.slug)}`;
  const urlOf = (l: Lang) => `${SITE_URL}${pagePath(l, p.slug)}`;
  // The 404 page has no language twins; its switch goes to each home page.
  const switchPath = (l: Lang) => pagePath(l, p.notFound ? '' : p.slug);
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
            {LANGS.map((l) => (
              <link key={l} rel="alternate" hrefLang={l} href={urlOf(l)} />
            ))}
            <link rel="alternate" hrefLang="x-default" href={urlOf('en')} />
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
          <details className="langs">
            <summary aria-label={t.languages}>{p.lang.toUpperCase()}</summary>
            <ul>
              {LANGS.map((l) => (
                <li key={l}>
                  <a
                    href={switchPath(l)}
                    hrefLang={l}
                    lang={l}
                    aria-current={l === p.lang ? 'true' : undefined}
                  >
                    {NATIVE[l]}
                  </a>
                </li>
              ))}
            </ul>
          </details>
        </header>
        <main id="main" className={p.wide ? 'main-wide' : undefined}>
          {p.children}
          {!p.notFound && showsFeedback(p.slug) && <Feedback lang={p.lang} slug={p.slug} />}
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
