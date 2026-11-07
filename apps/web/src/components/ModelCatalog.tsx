import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError } from '../api/client.ts';
import { type TFunction, useI18n } from '../i18n/index.tsx';
import { useCatalog, useStartPull } from '../settings/hooks.ts';
import { ModelPull } from './ModelPull.tsx';
import { Button } from '@hemmia/ui';

function startError(err: unknown, t: TFunction): string {
  if (!(err instanceof ApiError)) return t('error.generic');
  switch (err.code) {
    case 'disk_full':
      return t('pull.errorDisk');
    case 'busy':
      return t('pull.errorBusy');
    case 'paused':
      return t('pull.errorPaused');
    case 'unreachable':
      return t('pull.errorOllama');
    default:
      return t('error.generic');
  }
}

/** Settings → Models: download a model from the catalogue (recommended one first). */
export function ModelCatalog() {
  const { t, language } = useI18n();
  const { data } = useCatalog();
  const startPull = useStartPull();
  const queryClient = useQueryClient();
  const [active, setActive] = useState<{ model: string; pullId: string } | null>(null);
  if (!data) return null;

  const entries = [
    ...data.entries.filter((e) => e.recommended),
    ...data.entries.filter((e) => !e.recommended),
  ];
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-muted">{t('catalog.title')}</h3>
      <ul className="divide-y divide-line">
        {entries.map((e) => (
          <li key={e.ollamaModel} className={`py-3 ${e.fits ? '' : 'opacity-60'}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{e.label[language]}</span>
                  {e.recommended && (
                    <span className="rounded-full bg-champagne px-2 py-0.5 text-xs text-on-champagne">
                      {t('catalog.recommended')}
                    </span>
                  )}
                </p>
                <p className="text-sm text-muted">{e.description[language]}</p>
                <p className="text-sm text-muted">
                  {t('catalog.size', { size: String(e.downloadGiB) })}
                </p>
              </div>
              {!e.fits ? (
                <span className="shrink-0 text-sm text-muted">{t('catalog.needsMore')}</span>
              ) : e.installed ? (
                <span className="shrink-0 text-sm text-muted">{t('catalog.installed')}</span>
              ) : (
                <Button
                  variant="secondary"
                  disabled={startPull.isPending || active !== null}
                  onClick={() => {
                    startPull.mutate(e.ollamaModel, {
                      onSuccess: (r) => {
                        setActive({ model: e.ollamaModel, pullId: r.pullId });
                      },
                    });
                  }}
                >
                  {t('catalog.download')}
                </Button>
              )}
            </div>
            {active?.model === e.ollamaModel && (
              <ModelPull
                pullId={active.pullId}
                onFinished={(outcome) => {
                  void queryClient.invalidateQueries({ queryKey: ['admin', 'catalog'] });
                  void queryClient.invalidateQueries({ queryKey: ['admin', 'models'] });
                  if (outcome === 'done') setActive(null);
                }}
              />
            )}
          </li>
        ))}
      </ul>
      {startPull.error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {startError(startPull.error, t)}
        </p>
      )}
    </div>
  );
}
