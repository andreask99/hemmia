/**
 * Phone mode, M11: paste and check an API key. The key lives only in this component's state
 * until it is checked; the caller saves it to SecureStore (PHONE-MODE.md §5).
 */
import { useState } from 'react';
import type { ShellLanguage } from '../shell/i18n.ts';
import { usePhoneText } from './i18n.ts';

export const KEY_PAGES = {
  anthropic: 'https://platform.claude.com/settings/keys',
  openai: 'https://platform.openai.com/api-keys',
} as const;

type CheckResult = 'ok' | 'refused' | 'offline' | 'busy';

export function SetupKey(props: {
  provider: 'anthropic' | 'openai';
  checkKey: (key: string) => Promise<CheckResult>;
  onSaved: () => void;
  onOpenUrl: (url: string) => void;
  onBack: () => void;
  language?: ShellLanguage;
}) {
  const { t } = usePhoneText(props.language);
  const [key, setKey] = useState('');
  const [shown, setShown] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<Exclude<CheckResult, 'ok'> | null>(null);
  // App Store guideline 5.1.2(i): explicit permission before anything goes to a third-party AI.
  const [agreed, setAgreed] = useState(false);
  const name = props.provider === 'anthropic' ? t('setup.anthropic') : t('setup.openai');
  // Not every web view offers the clipboard (the type says it always exists).
  const canPaste = 'clipboard' in navigator && typeof navigator.clipboard.readText === 'function';

  const change = (value: string) => {
    setKey(value);
    setError(null);
  };

  const save = async () => {
    setChecking(true);
    setError(null);
    let result: CheckResult;
    try {
      result = await props.checkKey(key.trim());
    } catch {
      result = 'offline';
    }
    setChecking(false);
    if (result === 'ok') props.onSaved();
    else setError(result);
  };

  return (
    <div className="flex flex-col gap-5 p-6">
      <button
        type="button"
        onClick={props.onBack}
        className="self-start text-sm font-medium text-ink"
      >
        ‹ {t('setup.back')}
      </button>
      <p className="text-sm font-semibold text-forest">{name}</p>
      <h1 className="font-display text-2xl font-semibold text-ink">{t('setup.keyTitle')}</h1>
      <p className="text-sm text-muted">{t('setup.keyIntro', { provider: name })}</p>
      <button
        type="button"
        onClick={() => {
          props.onOpenUrl(KEY_PAGES[props.provider]);
        }}
        className="self-start text-sm font-semibold text-forest underline"
      >
        {t('setup.getKey', { provider: name })}
      </button>
      <div className="flex flex-col gap-2">
        <label htmlFor="api-key" className="text-sm font-medium text-ink">
          {t('setup.keyLabel')}
        </label>
        <div className="flex gap-2">
          <input
            id="api-key"
            type={shown ? 'text' : 'password'}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            value={key}
            onChange={(e) => {
              change(e.target.value);
            }}
            className="min-h-11 min-w-0 flex-1 rounded-xl border border-line bg-card px-3 font-mono text-sm"
          />
          {canPaste && (
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard
                  .readText()
                  .then((text) => {
                    change(text.trim());
                    setShown(false);
                  })
                  .catch(() => undefined);
              }}
              className="min-h-11 rounded-xl border border-line px-3 text-sm"
            >
              {t('setup.paste')}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setShown((s) => !s);
            }}
            className="min-h-11 rounded-xl border border-line px-3 text-sm"
          >
            {shown ? t('setup.hide') : t('setup.show')}
          </button>
        </div>
        <p className="text-xs text-muted">{t('setup.keyNote')}</p>
        <label className="flex min-h-11 items-start gap-3 text-sm">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => {
              setAgreed(e.target.checked);
            }}
            className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--forest)]"
          />
          <span>{t('setup.consent', { provider: name })}</span>
        </label>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {t(`setup.key.${error}`)}
          </p>
        )}
      </div>
      <button
        type="button"
        disabled={key.trim() === '' || !agreed || checking}
        onClick={() => void save()}
        className="min-h-12 rounded-xl bg-forest font-semibold text-on-forest disabled:opacity-50"
      >
        {checking ? t('setup.checking') : t('setup.save')}
      </button>
    </div>
  );
}
