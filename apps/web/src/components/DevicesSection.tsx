import { useState } from 'react';
import type { CreateLinkResponse } from '@hemmia/shared';
import { Button } from '@hemmia/ui';
import { useI18n } from '../i18n/index.tsx';
import { useCreateLink, useDevices, useRemoveDevice } from '../settings/hooks.ts';
import { QrCode } from './QrCode.tsx';

/**
 * Paired devices (SECURITY.md §3): the user's own in Settings → Account, or one user's for an
 * admin in the Family tab; remove a device, or add one with a device code (24 hours).
 */
export function DevicesSection({ userId, userName }: { userId?: string; userName?: string }) {
  const { t, language } = useI18n();
  const devices = useDevices(userId);
  const remove = useRemoveDevice(userId);
  const create = useCreateLink();
  const [link, setLink] = useState<CreateLinkResponse | null>(null);
  const [copied, setCopied] = useState(false);
  const url = link ? (link.shareLink ?? link.directLink) : null;

  return (
    <div className="flex flex-col gap-3">
      {devices.data && devices.data.devices.length === 0 && (
        <p className="text-sm text-muted">{t('devices.none')}</p>
      )}
      <ul className="divide-y divide-line">
        {devices.data?.devices.map((d) => (
          <li key={d.id} className="flex items-center justify-between gap-2 py-2">
            <div className="min-w-0">
              <p className="truncate">
                {d.label || t('settings.unknownDevice')}
                {d.current && (
                  <span className="ml-2 rounded-full bg-champagne px-2 py-0.5 text-xs font-semibold text-on-champagne">
                    {t('settings.thisDevice')}
                  </span>
                )}
              </p>
              <p className="text-xs text-muted">
                {t('settings.lastSeen', { when: new Date(d.lastSeenAt).toLocaleString(language) })}
              </p>
            </div>
            {!d.current && (
              <Button
                variant="secondary"
                onClick={() => {
                  if (window.confirm(t('devices.removeConfirm'))) remove.mutate(d.id);
                }}
              >
                {t('devices.remove')}
              </Button>
            )}
          </li>
        ))}
      </ul>
      {link ? (
        <div className="flex flex-col items-start gap-2">
          {url ? (
            <QrCode value={url} label={t('devices.qrLabel')} />
          ) : (
            <p className="font-mono text-sm break-all">{link.code}</p>
          )}
          <div className="flex w-full gap-2">
            <input
              readOnly
              aria-label={t('devices.link')}
              value={url ?? link.code}
              className="min-h-11 min-w-0 flex-1 rounded-xl border border-line bg-paper px-3 font-mono text-sm"
            />
            <Button
              variant="secondary"
              onClick={() => {
                void navigator.clipboard.writeText(url ?? link.code).then(() => {
                  setCopied(true);
                });
              }}
            >
              {copied ? t('devices.copied') : t('devices.copy')}
            </Button>
          </div>
          <p className="text-sm text-muted">{t('devices.valid24h')}</p>
        </div>
      ) : (
        <Button
          variant="secondary"
          disabled={create.isPending}
          onClick={() => {
            create.mutate(userId ? { kind: 'device', userId } : { kind: 'device' }, {
              onSuccess: (r) => {
                setLink(r);
                setCopied(false);
              },
            });
          }}
        >
          {userName ? t('devices.addFor', { name: userName }) : t('devices.add')}
        </Button>
      )}
      {(create.error ?? remove.error) && (
        <p role="alert" className="text-sm text-danger">
          {t('error.generic')}
        </p>
      )}
    </div>
  );
}
