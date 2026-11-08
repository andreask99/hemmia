/**
 * Header and footer links (WEBSITE.md §3). A link is shown only when its page exists in this
 * build, so the site never links to a missing page while it grows.
 */
import { type Lang, pagePath } from './content.ts';

export interface NavItem {
  /**
   * Page slug ('' is home) for internal links, an absolute URL, or a path built outside the
   * content pages (starting with '/', like the demo; it gets `?lang=`).
   */
  target: string;
  label: Record<Lang, string>;
}

export const HEADER_NAV: readonly NavItem[] = [
  { target: 'how-it-works', label: { en: 'How it works', de: 'So funktioniert es' } },
  { target: 'privacy', label: { en: 'Privacy', de: 'Datenschutz' } },
  { target: 'guides', label: { en: 'Guides', de: 'Anleitungen' } },
  { target: '/demo/', label: { en: 'Demo', de: 'Demo' } },
  { target: 'download', label: { en: 'Download', de: 'Download' } },
];

export const FOOTER_NAV: readonly NavItem[] = [
  { target: 'faq', label: { en: 'FAQ', de: 'Fragen' } },
  { target: 'help', label: { en: 'Help', de: 'Hilfe' } },
  { target: 'news', label: { en: 'News', de: 'Neuigkeiten' } },
  { target: 'press', label: { en: 'Press', de: 'Presse' } },
  { target: 'legal/privacy', label: { en: 'Privacy policy', de: 'Datenschutzerklärung' } },
  { target: 'legal/terms', label: { en: 'Terms of use', de: 'Nutzungsbedingungen' } },
  { target: 'legal/imprint', label: { en: 'Legal notice', de: 'Impressum' } },
];

export interface ResolvedNavItem {
  href: string;
  label: string;
  /** True for the page being rendered (aria-current="page"). */
  current: boolean;
}

/** The items whose page exists (or that are absolute URLs), with hrefs for this language. */
export function resolveNav(
  items: readonly NavItem[],
  lang: Lang,
  currentSlug: string,
  existing: ReadonlySet<string>,
): ResolvedNavItem[] {
  return items.flatMap((item) => {
    if (/^https?:\/\//.test(item.target))
      return [{ href: item.target, label: item.label[lang], current: false }];
    if (item.target.startsWith('/'))
      return [{ href: `${item.target}?lang=${lang}`, label: item.label[lang], current: false }];
    if (!existing.has(item.target)) return [];
    const current = currentSlug === item.target || currentSlug.startsWith(`${item.target}/`);
    return [{ href: pagePath(lang, item.target), label: item.label[lang], current }];
  });
}
