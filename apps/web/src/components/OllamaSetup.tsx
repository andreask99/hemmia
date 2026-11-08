/**
 * Above the model list: when this Mac has no Ollama, offers to install it (system/ollama.ts on
 * the hub) and shows the progress. Nothing is shown when an Ollama runs or can't be installed
 * here (Docker brings its own).
 */
import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@hemmia/ui';
import { useI18n } from '../i18n/index.tsx';
import { useInstallOllama, useOllamaSetup } from '../settings/hooks.ts';

const MB = 1024 * 1024;

export function OllamaSetup() {
  const { t } = useI18n();
  const { data } = useOllamaSetup();
  const install = useInstallOllama();
  const queryClient = useQueryClient();
  const state = data?.state;

  // Once Ollama answers, the model list can show what is installed and download more.
  const previous = useRef(state);
  useEffect(() => {
    if (previous.current !== state && (state === 'managed' || state === 'external')) {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'catalog'] });
      void queryClient.invalidateQueries({ queryKey: ['capabilities'] });
    }
    previous.current = state;
  }, [state, queryClient]);

  if (
    !data ||
    (state !== 'missing' && state !== 'installing' && state !== 'starting' && state !== 'failed')
  ) {
    return null;
  }
  const done = Math.round((data.received ?? 0) / MB);
  const total = data.total ? Math.round(data.total / MB) : null;

  return (
    <section className="mb-4 rounded-2xl border border-line bg-card p-4" aria-live="polite">
      <h3 className="font-semibold text-ink">{t('ollama.title')}</h3>
      {state === 'missing' && (
        <>
          <p className="mt-1 text-sm text-muted">{t('ollama.text')}</p>
          <Button
            className="mt-3"
            disabled={install.isPending}
            onClick={() => {
              install.mutate();
            }}
          >
            {t('ollama.install')}
          </Button>
        </>
      )}
      {state === 'installing' && (
        <>
          <p className="mt-1 text-sm text-muted">
            {total !== null
              ? t('ollama.installing', { done: String(done), total: String(total) })
              : t('ollama.installingNoTotal', { done: String(done) })}
          </p>
          <progress
            className="mt-2 w-full"
            max={total ?? undefined}
            value={total !== null ? done : undefined}
          />
        </>
      )}
      {state === 'starting' && <p className="mt-1 text-sm text-muted">{t('ollama.starting')}</p>}
      {state === 'failed' && (
        <>
          <p role="alert" className="mt-1 text-sm text-danger">
            {data.error === 'download' ? t('ollama.failedDownload') : t('ollama.failedCheck')}
          </p>
          <Button
            variant="secondary"
            className="mt-3"
            disabled={install.isPending}
            onClick={() => {
              install.mutate();
            }}
          >
            {t('ollama.retry')}
          </Button>
        </>
      )}
    </section>
  );
}
