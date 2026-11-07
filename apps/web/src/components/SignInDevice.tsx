import { useEffect, useState } from 'react';
import type { CreateLinkResponse } from '@hemmia/shared';
import { ApiError } from '../api/client.ts';
import { useI18n } from '../i18n/index.tsx';
import { useCreateLink } from '../settings/hooks.ts';
import { QrCode } from './QrCode.tsx';
import { Button, Field } from '@hemmia/ui';

/** Minutes and seconds left until `expiresAt`, ticking every second. */
function useCountdown(expiresAt: number | null): string | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (expiresAt === null) return;
    const id = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => {
      clearInterval(id);
    };
  }, [expiresAt]);
  if (expiresAt === null || expiresAt <= now) return null;
  const s = Math.floor((expiresAt - now) / 1000);
  return `${String(Math.floor(s / 60))}:${String(s % 60).padStart(2, '0')}`;
}

/** Settings → Account: a sign-in link for another device, as a QR code and a link to copy (SECURITY.md §4.2). */
export function SignInDevice() {
  const { t } = useI18n();
  const create = useCreateLink();
  const [link, setLink] = useState<CreateLinkResponse | null>(null);
  const [needsPassword, setNeedsPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [copied, setCopied] = useState(false);
  const left = useCountdown(link?.expiresAt ?? null);
  const url = link ? (link.shareLink ?? link.directLink) : null;
  /** Copying is for this device's browser: straight to the hub, not the join page for the app. */
  const copyUrl = link ? (link.directLink ?? link.shareLink) : null;

  const start = () => {
    create.mutate(
      { kind: 'signin', ...(needsPassword ? { password } : {}) },
      {
        onSuccess: (r) => {
          setLink(r);
          setCopied(false);
          setPassword('');
          setNeedsPassword(false);
        },
        onError: (err) => {
          if (err instanceof ApiError && err.code === 'invalid_credentials') setNeedsPassword(true);
        },
      },
    );
  };

  if (link && left !== null) {
    return (
      <div className="flex flex-col items-start gap-3">
        {url ? (
          <>
            <QrCode value={url} label={t('signin.qrLabel')} />
            <p className="text-sm">{t('signin.scan')}</p>
            {/* For the same phone (a new address, e.g. Hemmia Connect): copy and open in the browser. */}
            <div className="flex w-full gap-2">
              <input
                readOnly
                aria-label={t('signin.link')}
                value={copyUrl ?? url}
                className="min-h-11 min-w-0 flex-1 rounded-xl border border-line bg-paper px-3 font-mono text-sm"
              />
              <Button
                variant="secondary"
                onClick={() => {
                  void navigator.clipboard.writeText(copyUrl ?? url).then(() => {
                    setCopied(true);
                  });
                }}
              >
                {copied ? t('devices.copied') : t('devices.copy')}
              </Button>
            </div>
            <p className="text-sm text-muted" role="timer">
              {t('signin.validFor', { time: left })}
            </p>
          </>
        ) : (
          <p role="status" className="text-sm">
            {t('signin.noAddress')}
          </p>
        )}
        <Button
          variant="secondary"
          onClick={() => {
            setLink(null);
          }}
        >
          {t('signin.done')}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">{t('signin.intro')}</p>
      {needsPassword && (
        <Field
          id="signin-password"
          type="password"
          label={t('signin.password')}
          autoComplete="current-password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
          }}
        />
      )}
      {create.error instanceof ApiError &&
        create.error.code === 'invalid_credentials' &&
        password === '' &&
        needsPassword && <p className="text-sm text-muted">{t('signin.passwordNeeded')}</p>}
      {create.error &&
        !(create.error instanceof ApiError && create.error.code === 'invalid_credentials') && (
          <p role="alert" className="text-sm text-danger">
            {t('error.generic')}
          </p>
        )}
      <Button disabled={create.isPending || (needsPassword && password === '')} onClick={start}>
        {t('signin.show')}
      </Button>
    </div>
  );
}
