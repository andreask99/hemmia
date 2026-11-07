import { useShellText } from './i18n.ts';
import type { StoredHub } from './hubs.ts';
import type { ShellLanguage } from './i18n.ts';

export function Offline(props: {
  hub: StoredHub;
  onRetry: () => void;
  onSwitch: () => void;
  retrying: boolean;
  language?: ShellLanguage;
}) {
  const { t, language } = useShellText(props.language);
  const when = new Date(props.hub.lastReachedAt).toLocaleString(
    language === 'de' ? 'de-DE' : 'en-GB',
    { dateStyle: 'medium', timeStyle: 'short' },
  );

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex flex-col items-center gap-3.5 mt-12">
        <div className="w-24 h-24 flex items-center justify-center">
          <svg width="96" height="96" viewBox="0 0 72 72" role="img" aria-label={t('ghost.asleep')}>
            <circle cx="36" cy="36" r="36" fill="#e9e2cd"></circle>
            <path
              d="M20 55V34a16 16 0 0 1 32 0v21l-5.33-4-5.34 4-5.33-4-5.33 4-5.34-4z"
              fill="#fffdf8"
              stroke="#b9ae8e"
              strokeWidth="1.4"
              strokeLinejoin="round"
            ></path>
            <path
              d="M27.5 34q2.5 2 5 0M39.5 34q2.5 2 5 0"
              fill="none"
              stroke="#17231f"
              strokeWidth="1.8"
              strokeLinecap="round"
            ></path>
            <circle cx="36" cy="40.5" r="1.6" fill="#17231f"></circle>
            <circle cx="26" cy="39" r="2" fill="#e9b7a3"></circle>
            <circle cx="46" cy="39" r="2" fill="#e9b7a3"></circle>
            <path
              d="M50 16h6l-6 7h6M58 9h4l-4 5h4"
              fill="none"
              stroke="#8a5a0e"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            ></path>
          </svg>
        </div>
        <h1 className="m-0 font-display text-xl font-semibold text-ink text-center">
          {t('offline.title', { name: props.hub.name })}
        </h1>
        <p className="text-sm text-muted text-center">{t('offline.checklist')}</p>
      </div>

      <div className="bg-paper border border-line rounded-xl p-4 mt-3">
        <div className="flex flex-col gap-2 text-sm">
          <div>{t('offline.check1')}</div>
          <div>{t('offline.check2')}</div>
          <div className="mt-1">{t('offline.lastReached', { when })}</div>
        </div>
      </div>

      <div className="flex flex-col gap-3 mt-6">
        <button
          onClick={props.onRetry}
          disabled={props.retrying}
          className="w-full min-h-[52px] rounded-xl font-semibold text-base bg-forest text-on-forest disabled:opacity-50"
        >
          {t('offline.tryAgain.button')}
        </button>
        <button
          onClick={props.onSwitch}
          className="w-full min-h-[52px] rounded-xl bg-paper border border-line text-ink font-semibold text-base mt-1"
        >
          {t('offline.switch.button')}
        </button>
      </div>
    </div>
  );
}
