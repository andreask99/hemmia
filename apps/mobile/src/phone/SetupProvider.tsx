/** Phone mode, M10: choose the AI provider. */
import type { ShellLanguage } from '../shell/i18n.ts';
import { usePhoneText } from './i18n.ts';

export const API_KEY_GUIDE = {
  en: 'https://hemmia.app/guides/api-keys/',
  de: 'https://hemmia.app/de/guides/api-keys/',
};

export function SetupProvider(props: {
  onChoose: (provider: 'anthropic' | 'openai') => void;
  onBack: () => void;
  onOpenUrl: (url: string) => void;
  language?: ShellLanguage;
}) {
  const { t, language } = usePhoneText(props.language);
  const card = (provider: 'anthropic' | 'openai', name: string, models: string, text: string) => (
    <button
      type="button"
      onClick={() => {
        props.onChoose(provider);
      }}
      className="flex w-full flex-col items-start gap-1 rounded-xl border border-line bg-card p-4 text-left"
    >
      <span className="font-semibold text-ink">{name}</span>
      <span className="text-sm font-medium text-forest">{models}</span>
      <span className="text-sm text-muted">{text}</span>
    </button>
  );
  return (
    <div className="flex flex-col gap-5 p-6">
      <button
        type="button"
        onClick={props.onBack}
        className="-ml-2 min-h-11 self-start px-2 text-sm font-medium text-ink"
      >
        ‹ {t('setup.back')}
      </button>
      <h1 className="font-display text-2xl font-semibold text-ink">{t('setup.providerTitle')}</h1>
      <p className="text-sm text-muted">{t('setup.providerIntro')}</p>
      {card(
        'anthropic',
        t('setup.anthropic'),
        t('setup.anthropicModels'),
        t('setup.anthropicText'),
      )}
      {card('openai', t('setup.openai'), t('setup.openaiModels'), t('setup.openaiText'))}
      <p className="text-sm text-muted">{t('setup.otherLater')}</p>
      <p className="text-sm text-muted">{t('setup.direct')}</p>
      <button
        type="button"
        onClick={() => {
          props.onOpenUrl(API_KEY_GUIDE[language]);
        }}
        className="self-start text-sm font-semibold text-forest underline"
      >
        {t('setup.whatIsKey')}
      </button>
    </div>
  );
}
