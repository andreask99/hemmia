/** Phone mode, M13: keys, About me, language, export/import, move to a hub, delete everything. */
import { useState } from 'react';
import type { ShellLanguage } from '../shell/i18n.ts';
import { usePhoneText } from './i18n.ts';

type Provider = 'anthropic' | 'openai';

export interface PhoneSettingsProps {
  /** Masked keys ("sk-…Q7fA") or null. */
  keys: { anthropic: string | null; openai: string | null };
  onSetKey: (provider: Provider) => void;
  onRemoveKey: (provider: Provider) => void;
  aboutMe: string;
  onSaveAboutMe: (text: string) => void;
  phoneLanguage: 'en' | 'de';
  onLanguage: (language: 'en' | 'de') => void;
  onExport: () => void;
  onImport: (file: File) => void;
  onMoveToHub: () => void;
  onPrivacy: () => void;
  onDeleteEverything: () => void;
  onBack: () => void;
  language?: ShellLanguage;
}

const row =
  'flex min-h-12 w-full items-center justify-between gap-3 border-b border-line px-4 py-2 text-left';
const small = 'min-h-9 rounded-lg border border-line px-3 text-sm';

export function PhoneSettings(props: PhoneSettingsProps) {
  const { t } = usePhoneText(props.language);
  const [about, setAbout] = useState(props.aboutMe);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const provider = (p: Provider, name: string) => {
    const masked = props.keys[p];
    return (
      <div className={row}>
        <span className="flex flex-col">
          <span className="font-semibold text-ink">{name}</span>
          <span className="font-mono text-sm text-muted">{masked ?? t('settings.noKey')}</span>
        </span>
        <span className="flex gap-2">
          {masked ? (
            <>
              <button
                type="button"
                className={small}
                aria-label={`${t('settings.replace')} ${name}`}
                onClick={() => {
                  props.onSetKey(p);
                }}
              >
                {t('settings.replace')}
              </button>
              <button
                type="button"
                className={small}
                aria-label={`${t('settings.remove')} ${name}`}
                onClick={() => {
                  props.onRemoveKey(p);
                }}
              >
                {t('settings.remove')}
              </button>
            </>
          ) : (
            <button
              type="button"
              className={small}
              aria-label={`${t('settings.addKey')} ${name}`}
              onClick={() => {
                props.onSetKey(p);
              }}
            >
              {t('settings.addKey')}
            </button>
          )}
        </span>
      </div>
    );
  };

  const heading = (text: string) => (
    <h2 className="px-4 pt-6 pb-2 text-xs font-semibold tracking-wide text-muted uppercase">
      {text}
    </h2>
  );

  return (
    <div className="flex flex-col pb-10">
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <button type="button" onClick={props.onBack} className="min-h-11 px-2 text-sm font-medium">
          ‹ {t('settings.back')}
        </button>
        <h1 className="font-display text-lg font-semibold">{t('settings.title')}</h1>
      </div>

      {heading(t('settings.providers'))}
      <div className="bg-card">
        {provider('anthropic', 'Anthropic')}
        {provider('openai', 'OpenAI')}
      </div>

      {heading(t('settings.you'))}
      <div className="flex flex-col gap-2 bg-card px-4 py-3">
        <label htmlFor="about-me" className="font-semibold text-ink">
          {t('settings.aboutMe')}
        </label>
        <p className="text-sm text-muted">{t('settings.aboutMeHint')}</p>
        <textarea
          id="about-me"
          maxLength={2000}
          rows={4}
          value={about}
          onChange={(e) => {
            setAbout(e.target.value);
          }}
          className="rounded-xl border border-line bg-paper px-3 py-2"
        />
        <button
          type="button"
          disabled={about === props.aboutMe}
          onClick={() => {
            props.onSaveAboutMe(about.trim());
          }}
          className="min-h-10 self-start rounded-xl bg-forest px-4 font-semibold text-on-forest disabled:opacity-50"
        >
          {t('settings.save')}
        </button>
        <label htmlFor="phone-language" className="mt-3 font-semibold text-ink">
          {t('settings.language')}
        </label>
        <select
          id="phone-language"
          value={props.phoneLanguage}
          onChange={(e) => {
            props.onLanguage(e.target.value === 'de' ? 'de' : 'en');
          }}
          className="min-h-11 rounded-xl border border-line bg-paper px-3"
        >
          <option value="en">English</option>
          <option value="de">Deutsch</option>
        </select>
      </div>

      {heading(t('settings.chats'))}
      <div className="bg-card">
        <button type="button" className={row} onClick={props.onExport}>
          <span className="flex flex-col">
            <span className="text-ink">{t('settings.export')}</span>
            <span className="text-xs text-muted">{t('settings.exportNote')}</span>
          </span>
        </button>
        <label className={`${row} cursor-pointer`}>
          <span className="text-ink">{t('settings.import')}</span>
          <input
            type="file"
            accept="application/json,.json"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) props.onImport(file);
              e.target.value = '';
            }}
          />
        </label>
        <button type="button" className={row} onClick={props.onMoveToHub}>
          <span className="text-ink">{t('settings.moveToHub')}</span>
        </button>
        <button type="button" className={row} onClick={props.onPrivacy}>
          <span className="text-ink">{t('settings.privacy')}</span>
        </button>
      </div>

      <div className="mt-8 px-4">
        {confirmDelete ? (
          <div
            role="alertdialog"
            aria-label={t('settings.deleteAll')}
            className="flex flex-col gap-3 rounded-xl border border-danger p-4"
          >
            <p className="text-sm text-ink">{t('settings.deleteWarning')}</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={props.onDeleteEverything}
                className="min-h-11 rounded-xl bg-danger px-4 font-semibold text-on-forest"
              >
                {t('settings.deleteConfirm')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmDelete(false);
                }}
                className="min-h-11 rounded-xl border border-line px-4"
              >
                {t('settings.cancel')}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              setConfirmDelete(true);
            }}
            className="min-h-11 font-semibold text-danger"
          >
            {t('settings.deleteAll')}
          </button>
        )}
      </div>
    </div>
  );
}
