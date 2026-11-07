import type { WebSearch } from '@hemmia/shared';
import { useT } from '../i18n/index.tsx';

export function WebSearches({ searches }: { searches: readonly WebSearch[] }) {
  const t = useT();

  if (searches.length === 0) {
    return null;
  }

  const totalSources = searches.reduce((sum, search) => sum + search.sources.length, 0);

  return (
    <details className="w-full max-w-prose rounded-2xl border border-line bg-card px-4 py-2 text-sm">
      <summary className="cursor-pointer text-muted">
        {t('search.searched')} · {t('search.sources', { count: totalSources })}
      </summary>
      {searches.map((search, index) => (
        <div key={index} className="mt-2">
          <p className="font-medium">“{search.query}”</p>
          <ul className="mt-1 flex flex-col gap-1">
            {search.sources
              .filter((source) => {
                try {
                  const url = new URL(source.url);
                  return url.protocol === 'http:' || url.protocol === 'https:';
                } catch {
                  return false;
                }
              })
              .map((source, sourceIndex) => {
                const url = new URL(source.url);
                const hostname = url.hostname;
                const linkText = source.title.trim() || hostname;

                return (
                  <li key={sourceIndex} className="flex flex-wrap items-baseline">
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-forest underline underline-offset-2"
                    >
                      {linkText}
                    </a>
                    <span className="ml-1 text-xs text-muted">{hostname}</span>
                  </li>
                );
              })}
          </ul>
        </div>
      ))}
    </details>
  );
}
