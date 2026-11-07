/**
 * The few texts the shared components show. Each app passes its own translations (the web
 * app maps them from its i18n; phone mode from its own); English is the fallback.
 */
import { createContext, type ReactNode, useContext } from 'react';

export const UI_TEXTS_EN = {
  'chat.loadingAlmost': 'almost ready',
  'chat.loadingLeft': 'about {seconds} s left',
  'common.copied': 'Copied',
  'common.copy': 'Copy',
  'image.close': 'Close',
  'image.save': 'Save',
} as const;

export type UiTextKey = keyof typeof UI_TEXTS_EN;
export type UiT = (key: UiTextKey, vars?: Record<string, string | number>) => string;

export const englishUiText: UiT = (key, vars) =>
  UI_TEXTS_EN[key].replace(/\{(\w+)\}/g, (m, name: string) => {
    const v = vars?.[name];
    return v === undefined ? m : String(v);
  });

const Ctx = createContext<UiT>(englishUiText);

export function UiTextProvider({ t, children }: { t: UiT; children: ReactNode }) {
  return <Ctx.Provider value={t}>{children}</Ctx.Provider>;
}

export function useUiText(): UiT {
  return useContext(Ctx);
}
