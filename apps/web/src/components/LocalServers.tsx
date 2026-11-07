import { useState } from 'react';
import { ApiError } from '../api/client.ts';
import { useI18n } from '../i18n/index.tsx';
import { useAdminEngines, useAddEngine, useRemoveEngine } from '../settings/hooks.ts';
import { Button } from '@hemmia/ui';

export function LocalServers() {
  const { t } = useI18n();
  const engines = useAdminEngines();
  const addEngine = useAddEngine();
  const removeEngine = useRemoveEngine();
  const [label, setLabel] = useState('');
  const [baseUrl, setBaseUrl] = useState('');

  if (!engines.data) {
    return null;
  }

  const handleSubmit = (e: { preventDefault: () => void }) => {
    e.preventDefault();
    if (addEngine.isPending || !label.trim() || !baseUrl.trim()) return;

    addEngine.mutate(
      { label: label.trim(), baseUrl: baseUrl.trim() },
      {
        onSuccess: () => {
          setLabel('');
          setBaseUrl('');
        },
      },
    );
  };

  const handleRemove = (id: string) => {
    removeEngine.mutate(id);
  };

  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-muted">{t('engines.title')}</h3>

      {engines.data.custom.length > 0 ? (
        <ul className="divide-y divide-line">
          {engines.data.custom.map((e) => (
            <li key={e.id} className="flex min-h-12 items-center justify-between gap-3 py-1">
              <div>
                <span className="block font-semibold">{e.label}</span>
                <span className="block truncate font-mono text-sm text-muted">{e.baseUrl}</span>
                <span className="text-xs">
                  {e.reachable ? t('engines.reachable') : t('engines.unreachable')}
                </span>
                <span className="text-xs">
                  · {t('engines.models', { count: String(e.models.length) })}
                </span>
              </div>
              <Button
                variant="secondary"
                onClick={() => {
                  handleRemove(e.id);
                }}
                disabled={removeEngine.isPending}
              >
                {t('engines.remove')}
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">{t('engines.none')}</p>
      )}

      <form onSubmit={handleSubmit} className="mt-3">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <label className="block text-sm font-medium text-muted">
            {t('engines.label')}
            <input
              type="text"
              name="label"
              value={label}
              onChange={(e) => {
                setLabel(e.target.value);
              }}
              className="mt-1.5 min-h-12 w-full rounded-xl border border-line bg-paper px-3.5 text-base text-ink focus:border-forest focus:outline-none"
            />
          </label>
          <label className="block text-sm font-medium text-muted">
            {t('engines.baseUrl')}
            <input
              type="text"
              name="baseUrl"
              placeholder="http://127.0.0.1:1234/v1"
              value={baseUrl}
              onChange={(e) => {
                setBaseUrl(e.target.value);
              }}
              className="mt-1.5 min-h-12 w-full rounded-xl border border-line bg-paper px-3.5 text-base text-ink focus:border-forest focus:outline-none"
            />
          </label>
        </div>
        <Button
          type="submit"
          disabled={addEngine.isPending || !label.trim() || !baseUrl.trim()}
          className="mt-2"
        >
          {t('engines.add')}
        </Button>
        {addEngine.error && (
          <p role="alert" className="text-sm text-danger">
            {(() => {
              if (addEngine.error instanceof ApiError) {
                switch (addEngine.error.code) {
                  case 'address_not_allowed':
                    return t('engines.errorAddress');
                  case 'unreachable':
                    return t('engines.errorUnreachable');
                  case 'too_many':
                    return t('engines.errorTooMany');
                  default:
                    return t('error.generic');
                }
              }
              return t('error.generic');
            })()}
          </p>
        )}
      </form>
    </div>
  );
}
