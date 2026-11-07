import type { WebPage } from '@hemmia/shared';
import { useT } from '../i18n/index.tsx';
import { ArrowUpRightIcon } from '@hemmia/ui';

/** The page's host for a web link, or null (the app only links http/https). */
function webHost(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.hostname : null;
  } catch {
    return null;
  }
}

/** Pages the user linked in a message: read ones, and ones kchat couldn't read (with why). */
export function LinkedPages({ pages }: { pages: readonly WebPage[] }) {
  const t = useT();
  const shown = pages.flatMap((page) => {
    const host = webHost(page.url);
    return host === null ? [] : [{ page, host }];
  });
  if (shown.length === 0) return null;

  return (
    <div className="flex max-w-[85%] flex-col items-end gap-1.5">
      {shown.map(({ page, host }) =>
        page.status === 'read' ? (
          <a
            key={page.id}
            href={page.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex max-w-full items-center gap-2 rounded-xl bg-champagne px-3 py-2 text-sm text-on-champagne"
          >
            <ArrowUpRightIcon size={16} />
            <span className="truncate">{page.title || host}</span>
            {page.title && <span className="shrink-0 opacity-70">· {host}</span>}
          </a>
        ) : (
          <a
            key={page.id}
            href={page.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex max-w-full items-center gap-2 rounded-xl border border-line bg-card px-3 py-2 text-sm text-muted"
          >
            <span className="truncate">{t('pages.unreadable', { host })}</span>
            <span className="shrink-0">· {t(`pages.reason.${page.reason ?? 'error'}`)}</span>
          </a>
        ),
      )}
    </div>
  );
}
