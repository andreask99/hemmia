import type { Lang } from './content.ts';
import type { Download, Platform } from './downloads.ts';

/** The Mac package and Docker install Hemmia at home (the hub), not an app of their own. */
const NAMES: Record<Lang, Record<Platform, string>> = {
  en: {
    ios: 'iOS',
    android: 'Android',
    macos: 'Mac (Hemmia at home)',
    docker: 'Docker (Hemmia at home)',
  },
  de: {
    ios: 'iOS',
    android: 'Android',
    macos: 'Mac (Hemmia zu Hause)',
    docker: 'Docker (Hemmia zu Hause)',
  },
};

const T = {
  en: { download: 'Download', soon: 'Coming soon' },
  de: { download: 'Herunterladen', soon: 'Demnächst' },
} as const;

export function DownloadCards({ items, lang }: { items: Download[]; lang: Lang }) {
  const t = T[lang];
  return (
    <ul className="downloads">
      {items.map((d) => (
        <li key={d.platform} className="download-card">
          <h3>{NAMES[lang][d.platform]}</h3>
          <p>{d.note[lang]}</p>
          {d.url === '' ? (
            <span className="button button-disabled" aria-disabled="true">
              {t.soon}
            </span>
          ) : (
            <a className="button" href={d.url}>
              {d.version ? `${t.download} ${d.version}` : t.download}
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}
