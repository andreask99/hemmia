import { useState } from 'react';
import { useShellText } from './i18n.ts';
import type { ShellLanguage } from './i18n.ts';

export function Scan(props: {
  onPasteLink: (text: string) => void;
  onBack: () => void;
  error: string | null;
  language?: ShellLanguage;
}) {
  const { t } = useShellText(props.language);
  const [link, setLink] = useState('');
  const trimmedLink = link.trim();
  const canContinue = trimmedLink.length > 0;

  return (
    <div className="flex flex-col gap-4 p-6">
      <button
        onClick={props.onBack}
        className="-ml-2 min-h-11 self-start px-2 text-sm font-medium text-ink"
      >
        {t('scan.back.button')}
      </button>

      <h1 className="m-0 font-display text-xl font-semibold text-ink">{t('scan.title')}</h1>
      <p className="text-sm text-muted">{t('scan.intro')}</p>

      <div className="flex-grow flex items-center justify-center mt-6">
        <div
          aria-hidden="true"
          className="w-67.5 h-67.5 border-2 border-dashed border-line rounded-xl flex items-center justify-center"
        >
          <div className="w-57.5 h-57.5 border border-line rounded-lg"></div>
        </div>
      </div>

      <div className="flex flex-col gap-3 mt-6">
        {props.error && (
          <p role="alert" className="text-sm text-danger">
            {props.error}
          </p>
        )}

        <div className="flex flex-col gap-2">
          <label htmlFor="paste-link" className="text-sm font-medium text-ink">
            {t('scan.paste.label')}
          </label>
          <div className="flex gap-2">
            <input
              id="paste-link"
              type="text"
              value={link}
              onChange={(e) => {
                setLink(e.target.value);
              }}
              placeholder={t('scan.paste.placeholder')}
              aria-label={t('scan.paste.label')}
              className="flex-grow px-3 py-2 rounded-lg border border-line bg-paper text-ink text-sm"
            />
            <button
              onClick={() => {
                props.onPasteLink(trimmedLink);
              }}
              disabled={!canContinue}
              className="px-4 py-2 rounded-lg font-medium text-sm bg-forest text-on-forest disabled:opacity-50"
            >
              {t('scan.paste.continue')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
