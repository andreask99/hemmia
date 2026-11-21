import { useState } from 'react';
import { ApiError } from '../api/client.ts';
import { type TFunction, useI18n } from '../i18n/index.tsx';
import { useDeleteModel, useInstalledModels } from '../settings/hooks.ts';
import { Button } from '@hemmia/ui';

function deleteError(err: unknown, t: TFunction): string {
  if (err instanceof ApiError && err.code === 'busy') return t('installed.errorBusy');
  if (err instanceof ApiError && err.code === 'last_model') return t('installed.errorLast');
  return t('error.generic');
}

/** Settings → Models: what is on this computer's disk, with Delete (P11.9). */
export function InstalledModels() {
  const { t } = useI18n();
  const { data } = useInstalledModels();
  const remove = useDeleteModel();
  const [confirm, setConfirm] = useState<string | null>(null);
  if (!data || data.models.length === 0) return null;
  return (
    <div>
      <h3 className="text-sm font-semibold text-muted">{t('installed.title')}</h3>
      {data.diskFreeGiB !== null && (
        <p className="text-sm text-muted">
          {t('installed.free', { free: String(Math.round(data.diskFreeGiB)) })}
        </p>
      )}
      <ul className="mt-1 divide-y divide-line">
        {data.models.map((m) => (
          <li key={m.model} className="py-2">
            <div className="flex min-h-11 items-center justify-between gap-3">
              <span className="min-w-0 truncate font-mono text-sm">
                {m.model}{' '}
                <span className="text-muted">
                  · {m.sizeGiB} GB · {m.offeredId ? t('installed.offered') : t('installed.notUsed')}
                </span>
              </span>
              {confirm !== m.model && (
                <Button
                  variant="secondary"
                  disabled={remove.isPending}
                  onClick={() => {
                    remove.reset();
                    setConfirm(m.model);
                  }}
                >
                  {t('installed.delete')}
                </Button>
              )}
            </div>
            {confirm === m.model && (
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className="text-sm">{t('installed.confirm', { model: m.model })}</span>
                <Button
                  variant="danger"
                  disabled={remove.isPending}
                  onClick={() => {
                    remove.mutate(m.model, {
                      onSuccess: () => {
                        setConfirm(null);
                      },
                    });
                  }}
                >
                  {t('installed.delete')}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setConfirm(null);
                  }}
                >
                  {t('installed.cancel')}
                </Button>
              </div>
            )}
            {confirm === m.model && remove.error && (
              <p role="alert" className="mt-1 text-sm text-danger">
                {deleteError(remove.error, t)}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
