import { useShellText } from './i18n.ts';
import type { StoredHub } from './hubs.ts';
import type { ShellLanguage } from './i18n.ts';

export function HubList(props: {
  hubs: StoredHub[];
  onOpenHub: (hubHost: string) => void;
  onRemove: (hubHost: string) => void;
  onAdd: () => void;
  /** Phone mode is set up: "On this phone" comes first in the list. */
  onPhoneMode?: () => void;
  language?: ShellLanguage;
}) {
  const { t } = useShellText(props.language);

  return (
    <div className="flex flex-col gap-4 p-6">
      <h1 className="m-0 font-display text-xl font-semibold text-ink">{t('hubList.title')}</h1>

      {props.onPhoneMode && (
        <button
          type="button"
          onClick={props.onPhoneMode}
          className="text-left p-3 rounded-lg bg-card border border-line"
        >
          <span className="block font-semibold text-ink">{t('hubList.phone')}</span>
          <span className="block text-sm text-muted">{t('hubList.phoneText')}</span>
        </button>
      )}

      {props.hubs.length === 0 && !props.onPhoneMode ? (
        <p className="text-sm text-muted">{t('hubList.empty')}</p>
      ) : props.hubs.length === 0 ? null : (
        <ul className="flex flex-col gap-2 mt-3">
          {props.hubs.map((hub) => (
            <li key={hub.hubHost} className="flex items-center justify-between gap-3">
              <button
                onClick={() => {
                  props.onOpenHub(hub.hubHost);
                }}
                className="flex-grow text-left p-3 rounded-lg bg-card border border-line"
              >
                <span className="block font-semibold text-ink">{hub.name}</span>
                <span className="block text-sm text-muted">{hub.hubHost}</span>
              </button>
              <button
                onClick={() => {
                  props.onRemove(hub.hubHost);
                }}
                aria-label={t('hubList.remove', { name: hub.name })}
                className="p-2 rounded-lg bg-paper border border-line text-ink"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path
                    d="M4 4L12 12M12 4L4 12"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}

      <button
        onClick={props.onAdd}
        className="w-full min-h-[52px] rounded-xl bg-card border border-line text-ink font-semibold text-base mt-3"
      >
        {t('hubList.add')}
      </button>
    </div>
  );
}
