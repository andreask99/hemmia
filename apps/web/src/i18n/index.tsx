import { UiTextProvider } from '@hemmia/ui';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { en, type MessageKey, type Messages } from './en.ts';
import { de } from './de.ts';

export type { MessageKey } from './en.ts';

export const LANGUAGES = ['en', 'de'] as const;
export type Language = (typeof LANGUAGES)[number];

const catalogues: Record<Language, Messages> = { en, de };
const STORAGE_KEY = 'kchat.language';

export type TFunction = (key: MessageKey, params?: Record<string, string | number>) => string;

interface I18nContextValue {
  language: Language;
  setLanguage: (language: Language) => void;
  t: TFunction;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value);
}

/** English by default (owner decision); a stored choice wins. The server-side user
 *  preference will override this once /me exists. */
function initialLanguage(): Language {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isLanguage(stored)) return stored;
  } catch {
    // storage unavailable (private mode); fall through
  }
  return 'en';
}

export function translate(
  language: Language,
  key: MessageKey,
  params?: Record<string, string | number>,
): string {
  const template = catalogues[language][key];
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}

export function I18nProvider({
  children,
  language: fixedLanguage,
}: {
  children: ReactNode;
  /** For tests: force a language and skip storage. */
  language?: Language;
}) {
  const [language, setLanguageState] = useState<Language>(() => fixedLanguage ?? initialLanguage());

  const setLanguage = useCallback((next: Language) => {
    setLanguageState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore
    }
    document.documentElement.lang = next;
  }, []);

  const value = useMemo<I18nContextValue>(
    () => ({
      language,
      setLanguage,
      t: (key, params) => translate(language, key, params),
    }),
    [language, setLanguage],
  );

  // The shared components (@hemmia/ui) read their few texts through their own provider.
  return (
    <I18nContext.Provider value={value}>
      <UiTextProvider t={value.t}>{children}</UiTextProvider>
    </I18nContext.Provider>
  );
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside <I18nProvider>');
  return ctx;
}

export function useT(): TFunction {
  return useI18n().t;
}
