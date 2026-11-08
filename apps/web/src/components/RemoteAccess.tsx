import { useRemoteStatus, useSetRemote, useForgetRemote } from '../settings/hooks.ts';
import type { RemoteStatus } from '@hemmia/shared';
import { type MessageKey, useI18n } from '../i18n/index.tsx';

function stateKey(state: RemoteStatus['state']): MessageKey {
  switch (state) {
    case 'off':
      return 'remote.state.off';
    case 'connecting':
      return 'remote.state.connecting';
    case 'connected':
      return 'remote.state.connected';
    case 'blocked':
      return 'remote.state.blocked';
    case 'error':
      return 'remote.state.error';
  }
}

/** Settings → System: kchat Connect (mockup M9, upper card). */
export function RemoteAccess() {
  const { data, isLoading } = useRemoteStatus();
  const setRemote = useSetRemote();
  const forget = useForgetRemote();
  const { t, language } = useI18n();

  if (isLoading || !data) return null;

  if (!data.relayConfigured) {
    return (
      <div>
        <h3 className="mb-2 text-sm font-semibold text-muted">{t('remote.title')}</h3>
        <p className="text-sm text-muted">{t('remote.notAvailable')}</p>
      </div>
    );
  }

  const gb = (bytes: number) => (bytes / 1e9).toFixed(1);
  // Connect is our service: its terms and privacy policy (legal review 2026-11-07, A15).
  const site = language === 'de' ? 'https://hemmia.app/de' : 'https://hemmia.app';

  return (
    <div className="flex flex-col gap-1.5">
      <h3 className="mb-1 text-sm font-semibold text-muted">{t('remote.title')}</h3>
      <label className="flex min-h-11 items-center justify-between gap-4 text-[15px]">
        {t('remote.switch')}
        <input
          type="checkbox"
          role="switch"
          aria-label={t('remote.switch')}
          checked={data.connect}
          disabled={setRemote.isPending}
          onChange={(e) => {
            setRemote.mutate(e.target.checked);
          }}
          className="h-6 w-6 shrink-0 accent-[var(--forest)]"
        />
      </label>
      <p className="text-xs text-muted">
        {t('remote.legal')}{' '}
        <a
          href={`${site}/legal/terms/`}
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          {t('remote.terms')}
        </a>
        {' · '}
        <a
          href={`${site}/legal/privacy/`}
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          {t('remote.privacy')}
        </a>
      </p>
      {setRemote.isPending && (
        <span role="status" className="text-sm text-muted">
          {t('remote.working')}
        </span>
      )}
      <p className="text-sm">
        <span
          aria-hidden="true"
          className={
            data.state === 'connected'
              ? 'text-ok'
              : data.state === 'blocked' || data.state === 'error'
                ? 'text-danger'
                : 'text-muted'
          }
        >
          ●
        </span>{' '}
        {t(stateKey(data.state))}
      </p>
      {data.lastError === 'outdated' && (
        <p role="alert" className="text-sm text-danger">
          {t('remote.outdated')}
        </p>
      )}
      {data.hostname && <p className="font-mono text-sm break-all">{data.hostname}</p>}
      {data.certificate && (
        <p className="text-sm">
          {t('remote.certificate', {
            date: new Date(data.certificate.notAfter).toLocaleDateString(
              language === 'de' ? 'de-DE' : 'en-GB',
              { day: 'numeric', month: 'short', year: 'numeric' },
            ),
          })}
        </p>
      )}
      {data.quota && (
        <p className="text-sm">
          {t('remote.quota', {
            used: gb(data.quota.bytes),
            limit: gb(data.quota.limitBytes),
          })}
        </p>
      )}
      {data.hostname && (
        <button
          type="button"
          className="text-sm font-semibold text-danger underline"
          onClick={() => {
            if (window.confirm(t('remote.forgetConfirm'))) forget.mutate();
          }}
        >
          {t('remote.forget')}
        </button>
      )}
      {(setRemote.error || forget.error) && (
        <p role="alert" className="text-sm text-danger">
          {t('error.generic')}
        </p>
      )}
    </div>
  );
}
