/**
 * "Pictures" in setup and Settings → Models: on a Mac where Hemmia can set up pictures itself
 * (system/pictures.ts on the hub), offers it and shows the progress. Nothing is shown where
 * pictures come from elsewhere or aren't possible at all (not a Mac).
 */
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { Button } from '@hemmia/ui';
import { useI18n } from '../i18n/index.tsx';
import { useInstallPictures, usePicturesSetup } from '../settings/hooks.ts';

const GB = 1024 ** 3;
const gb = (bytes: number) => (bytes / GB).toFixed(1);

export function PicturesSetup() {
  const { t } = useI18n();
  const { data } = usePicturesSetup();
  const install = useInstallPictures();
  const queryClient = useQueryClient();
  const state = data?.state;

  // Once ready, the apps offer pictures: refresh what the hub can do.
  const previous = useRef(state);
  useEffect(() => {
    if (previous.current === 'installing' && state === 'ready') {
      void queryClient.invalidateQueries({ queryKey: ['capabilities'] });
      void queryClient.invalidateQueries({ queryKey: ['models'] });
    }
    previous.current = state;
  }, [state, queryClient]);

  if (!data || (state === 'unsupported' && data.reason === 'platform')) return null;

  const start = () => {
    install.mutate();
  };
  return (
    <section className="rounded-2xl border border-line bg-card p-4" aria-live="polite">
      <h3 className="font-semibold text-ink">{t('pictures.title')}</h3>
      {state === 'off' && (
        <>
          <p className="mt-1 text-sm text-muted">
            {t('pictures.offText', { size: gb(data.downloadBytes ?? 5 * GB) })}
          </p>
          <Button className="mt-3" disabled={install.isPending} onClick={start}>
            {t('pictures.turnOn')}
          </Button>
        </>
      )}
      {state === 'installing' && (
        <>
          <p className="mt-1 text-sm text-muted">
            {data.phase === 'model'
              ? t('pictures.model', {
                  done: gb(data.received ?? 0),
                  total: gb(data.total ?? 0),
                })
              : data.phase === 'engine'
                ? t('pictures.engine')
                : t('pictures.tool')}
          </p>
          <progress
            className="mt-2 w-full"
            max={data.phase === 'model' && data.total ? data.total : undefined}
            value={data.phase === 'model' && data.total ? (data.received ?? 0) : undefined}
          />
        </>
      )}
      {state === 'ready' && <p className="mt-1 text-sm text-muted">{t('pictures.ready')}</p>}
      {state === 'unsupported' && <p className="mt-1 text-sm text-muted">{t('pictures.memory')}</p>}
      {state === 'failed' && (
        <>
          <p role="alert" className="mt-1 text-sm text-danger">
            {data.error === 'download'
              ? t('pictures.failedDownload')
              : data.error === 'checksum'
                ? t('pictures.failedCheck')
                : t('pictures.failedEngine')}
          </p>
          <Button variant="secondary" className="mt-3" disabled={install.isPending} onClick={start}>
            {t('pictures.retry')}
          </Button>
        </>
      )}
    </section>
  );
}
