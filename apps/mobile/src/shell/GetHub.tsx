import { useShellText } from './i18n.ts';
import type { ShellLanguage } from './i18n.ts';

export function GetHub(props: {
  onShareDownloadLink: () => void;
  onBack: () => void;
  language?: ShellLanguage;
}) {
  const { t } = useShellText(props.language);

  return (
    <div className="flex flex-col gap-4 p-6">
      <button
        onClick={props.onBack}
        className="-ml-2 min-h-11 self-start px-2 text-sm font-medium text-ink"
      >
        {t('scan.back.button')}
      </button>

      <h1 className="m-0 font-display text-xl font-semibold text-ink">{t('getHub.title')}</h1>
      <p className="text-sm text-muted">{t('getHub.intro')}</p>

      <div className="flex flex-col gap-2.5 bg-paper border border-line rounded-xl p-4.5 mt-3">
        <div className="flex gap-3">
          <span className="flex-shrink-0 w-6.5 h-6.5 rounded-full bg-forest text-on-forest font-semibold text-sm flex items-center justify-center">
            1
          </span>
          <p className="text-sm">{t('getHub.step1')}</p>
        </div>
        <div className="flex gap-3">
          <span className="flex-shrink-0 w-6.5 h-6.5 rounded-full bg-forest text-on-forest font-semibold text-sm flex items-center justify-center">
            2
          </span>
          <p className="text-sm">{t('getHub.step2')}</p>
        </div>
        <div className="flex gap-3">
          <span className="flex-shrink-0 w-6.5 h-6.5 rounded-full bg-forest text-on-forest font-semibold text-sm flex items-center justify-center">
            3
          </span>
          <p className="text-sm">{t('getHub.step3')}</p>
        </div>
      </div>

      <div className="flex flex-col gap-2.5 mt-4">
        <button
          onClick={props.onShareDownloadLink}
          className="w-full min-h-[52px] rounded-xl bg-card border border-line text-ink font-semibold text-base"
        >
          {t('getHub.sendLink.button')}
        </button>
        <button
          onClick={props.onBack}
          className="w-full min-h-[52px] rounded-xl bg-forest text-on-forest font-semibold text-base mt-1"
        >
          {t('getHub.scan.button')}
        </button>
      </div>
    </div>
  );
}
