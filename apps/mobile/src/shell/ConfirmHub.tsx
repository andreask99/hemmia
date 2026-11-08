/**
 * Before a hub from a tapped link is saved and opened (security review 2026-11-07, H1): the
 * full address, so a link from a stranger can't open an unknown site inside the app unasked.
 */
import { type ShellLanguage, useShellText } from './i18n.ts';

export function ConfirmHub(props: {
  hubHost: string;
  onConfirm: () => void;
  onCancel: () => void;
  language?: ShellLanguage;
}) {
  const { t } = useShellText(props.language);
  const tailnet = props.hubHost.endsWith('.ts.net');
  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex flex-col items-center gap-3.5 mt-16">
        <h1 className="m-0 font-display text-xl font-semibold text-ink text-center">
          {t('confirm.title')}
        </h1>
        <p className="text-sm text-muted text-center">{t('confirm.text')}</p>
        <p
          className="w-full break-all rounded-xl border border-line bg-paper p-3 text-center font-mono text-sm text-ink"
          data-testid="confirm-host"
        >
          {props.hubHost}
        </p>
        {tailnet && <p className="text-sm text-muted text-center">{t('confirm.tailnet')}</p>}
        <p className="text-sm text-muted text-center">{t('confirm.trust')}</p>
      </div>
      <div className="flex flex-col gap-3 mt-6">
        <button
          onClick={props.onConfirm}
          className="w-full min-h-[52px] rounded-xl font-semibold text-base bg-forest text-on-forest"
        >
          {t('confirm.add.button')}
        </button>
        <button
          onClick={props.onCancel}
          className="w-full min-h-[52px] rounded-xl bg-paper border border-line text-ink font-semibold text-base"
        >
          {t('confirm.cancel.button')}
        </button>
      </div>
    </div>
  );
}
