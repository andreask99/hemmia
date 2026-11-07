import { useState } from 'react';
import { useShellText } from './i18n.ts';
import type { ShellLanguage } from './i18n.ts';

export function Welcome(props: {
  onScan: () => void;
  onPasteLink: (text: string) => void;
  onGetHub: () => void;
  /** "Just me, on this phone" (phone mode, PHONE-MODE.md §3). */
  onPhoneMode: () => void;
  language?: ShellLanguage;
}) {
  const { t } = useShellText(props.language);
  const [link, setLink] = useState('');
  const trimmedLink = link.trim();
  const canContinue = trimmedLink.length > 0;

  return (
    <div className="flex flex-col items-center gap-4 p-6 mt-6">
      <div className="flex flex-col items-center gap-3.5">
        <div className="w-28 h-31 flex items-center justify-center">
          <svg width="112" height="124" viewBox="14 12 44 52" role="img" aria-label={t('ghost')}>
            <ellipse cx="36" cy="61" rx="11" ry="2" fill="#e0dccf"></ellipse>
            <path
              d="M20 55V34a16 16 0 0 1 32 0v21l-5.33-4-5.34 4-5.33-4-5.33 4-5.34-4z"
              fill="#fffdf8"
              stroke="#1f4d3f"
              strokeWidth="1.6"
              strokeLinejoin="round"
            ></path>
            <circle cx="30" cy="34" r="2.4" fill="#17231f"></circle>
            <circle cx="42" cy="34" r="2.4" fill="#17231f"></circle>
            <path
              d="M32.6 40q3.4 2.8 6.8 0"
              fill="none"
              stroke="#17231f"
              strokeWidth="1.8"
              strokeLinecap="round"
            ></path>
            <circle cx="26" cy="39" r="2" fill="#e9b7a3"></circle>
            <circle cx="46" cy="39" r="2" fill="#e9b7a3"></circle>
          </svg>
        </div>
        <h1 className="m-0 font-display text-2xl font-semibold text-ink">{t('welcome.title')}</h1>
        <p className="m-0 text-center text-sm text-muted">{t('welcome.intro')}</p>
      </div>

      <div className="flex-grow"></div>

      <div className="flex flex-col gap-3 w-full">
        <button
          onClick={props.onScan}
          className="w-full min-h-[52px] rounded-xl bg-card border border-line text-ink font-semibold text-base"
        >
          {t('welcome.scan.button')}
        </button>

        <div className="flex flex-col gap-2 mt-3">
          <label htmlFor="paste-link" className="text-sm font-medium text-ink">
            {t('welcome.paste.label')}
          </label>
          <div className="flex gap-2">
            <input
              id="paste-link"
              type="text"
              value={link}
              onChange={(e) => {
                setLink(e.target.value);
              }}
              placeholder={t('welcome.paste.placeholder')}
              aria-label={t('welcome.paste.label')}
              className="flex-grow px-3 py-2 rounded-lg border border-line bg-paper text-ink text-sm"
            />
            <button
              onClick={() => {
                props.onPasteLink(trimmedLink);
              }}
              disabled={!canContinue}
              className="px-4 py-2 rounded-lg font-medium text-sm bg-forest text-on-forest disabled:opacity-50"
            >
              {t('welcome.paste.continue')}
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={props.onPhoneMode}
          className="w-full rounded-xl border border-line bg-card p-4 text-left mt-3"
        >
          <span className="block font-semibold text-ink">{t('welcome.phone.title')}</span>
          <span className="block text-sm text-muted">{t('welcome.phone.text')}</span>
        </button>

        <button
          onClick={props.onGetHub}
          className="w-full min-h-[52px] rounded-xl bg-paper border border-line text-ink font-medium text-base mt-3"
        >
          {t('welcome.getHub.button')}
        </button>
      </div>
    </div>
  );
}
