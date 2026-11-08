/**
 * Web search on a Mac without SearXNG: offers Hemmia's own (system/search.ts on the hub) and
 * shows the progress. Nothing is shown when search works; where Hemmia can't set it up (Docker
 * without the searxng profile), the plain note stays.
 */
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { Button } from '@hemmia/ui';
import { useI18n } from '../i18n/index.tsx';
import { useInstallSearch, useSearchSetup } from '../settings/hooks.ts';

export function SearchSetup() {
  const { t } = useI18n();
  const { data } = useSearchSetup();
  const install = useInstallSearch();
  const queryClient = useQueryClient();
  const state = data?.state;

  const previous = useRef(state);
  useEffect(() => {
    if (previous.current !== 'ready' && previous.current !== undefined && state === 'ready') {
      void queryClient.invalidateQueries({ queryKey: ['capabilities'] });
    }
    previous.current = state;
  }, [state, queryClient]);

  if (!data || state === 'ready') return null;
  if (state === 'unsupported') {
    return <p className="text-sm text-muted">{t('admin.webSearchUnavailable')}</p>;
  }
  const start = () => {
    install.mutate();
  };
  return (
    <section className="rounded-2xl border border-line bg-card p-4" aria-live="polite">
      <h3 className="font-semibold text-ink">{t('search.title')}</h3>
      {state === 'off' && (
        <>
          <p className="mt-1 text-sm text-muted">{t('search.offText')}</p>
          <Button className="mt-3" disabled={install.isPending} onClick={start}>
            {t('search.turnOn')}
          </Button>
        </>
      )}
      {(state === 'installing' || state === 'starting') && (
        <>
          <p className="mt-1 text-sm text-muted">
            {state === 'installing' ? t('search.installing') : t('search.starting')}
          </p>
          <progress className="mt-2 w-full" />
        </>
      )}
      {state === 'failed' && (
        <>
          <p role="alert" className="mt-1 text-sm text-danger">
            {data.error === 'download'
              ? t('search.failedDownload')
              : data.error === 'checksum'
                ? t('search.failedCheck')
                : t('search.failedEngine')}
          </p>
          <Button variant="secondary" className="mt-3" disabled={install.isPending} onClick={start}>
            {t('pictures.retry')}
          </Button>
        </>
      )}
    </section>
  );
}
