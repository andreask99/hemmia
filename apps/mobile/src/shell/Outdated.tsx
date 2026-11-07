/** The version handshake failed (PLAN.md P5.11): this app or the hub needs an update. */
import type { StoredHub } from './hubs.ts';
import { type ShellLanguage, useShellText } from './i18n.ts';

export function Outdated(props: {
  hub: StoredHub;
  side: 'app' | 'hub';
  /** The store page for this app ("Update the app"). */
  storeUrl: string;
  onRetry: () => void;
  onSwitch: () => void;
  language?: ShellLanguage;
}) {
  const { t } = useShellText(props.language);
  const name = props.hub.name;
  const primary =
    'w-full min-h-[52px] rounded-xl font-semibold text-base bg-forest text-on-forest flex items-center justify-center';
  const secondary =
    'w-full min-h-[52px] rounded-xl bg-paper border border-line text-ink font-semibold text-base';

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex flex-col items-center gap-3.5 mt-16">
        <h1 className="m-0 font-display text-xl font-semibold text-ink text-center">
          {t(props.side === 'app' ? 'outdated.app.title' : 'outdated.hub.title', { name })}
        </h1>
        <p className="text-sm text-muted text-center">
          {t(props.side === 'app' ? 'outdated.app.text' : 'outdated.hub.text', { name })}
        </p>
      </div>
      <div className="flex flex-col gap-3 mt-6">
        {props.side === 'app' ? (
          <a href={props.storeUrl} target="_blank" rel="noopener noreferrer" className={primary}>
            {t('outdated.app.button')}
          </a>
        ) : (
          <button onClick={props.onRetry} className={primary}>
            {t('outdated.retry.button')}
          </button>
        )}
        <button onClick={props.onSwitch} className={`${secondary} mt-1`}>
          {t('offline.switch.button')}
        </button>
      </div>
    </div>
  );
}
