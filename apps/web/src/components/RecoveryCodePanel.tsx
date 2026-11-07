import { useState } from 'react';
import { useT } from '../i18n/index.tsx';
import { CopyIcon } from '@hemmia/ui';
import { useSensitiveScreen } from '../native/hooks.ts';
import { AuthShell, Button, Card } from '@hemmia/ui';

export function RecoveryCodePanel({
  code,
  note,
  onDone,
}: {
  code: string;
  note?: string;
  onDone: () => void;
}) {
  useSensitiveScreen();
  const t = useT();
  const [copied, setCopied] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  return (
    <AuthShell title={t('recovery.title')} {...(note ? { intro: note } : {})}>
      <Card className="flex flex-col gap-4">
        <p className="text-[15px] leading-relaxed">{t('recovery.intro')}</p>
        <div
          data-testid="recovery-code"
          className="rounded-xl bg-champagne px-4 py-4 text-center font-mono text-lg tracking-wider break-words text-on-champagne select-all"
        >
          {code}
        </div>
        <Button
          variant="secondary"
          onClick={() => {
            navigator.clipboard
              .writeText(code)
              .then(() => {
                setCopied(true);
                setTimeout(() => {
                  setCopied(false);
                }, 2000);
              })
              .catch(() => undefined);
          }}
        >
          <CopyIcon size={18} />
          {copied ? t('common.copied') : t('common.copy')}
        </Button>
        <p className="text-sm leading-relaxed text-muted">{t('recovery.writeDown')}</p>
        <label className="flex min-h-11 items-center gap-3 text-[15px]">
          <input
            name="recoveryCodeSaved"
            type="checkbox"
            checked={confirmed}
            onChange={(e) => {
              setConfirmed(e.target.checked);
            }}
            className="h-5 w-5 accent-[var(--forest)]"
          />
          {t('recovery.confirm')}
        </label>
        <Button disabled={!confirmed} onClick={onDone} className="min-h-12">
          {t('common.continue')}
        </Button>
      </Card>
    </AuthShell>
  );
}
