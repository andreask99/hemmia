/** Screenshot names and files (WEBSITE.md §7); the conversion itself is scripts/screenshots.ts. */
import { z } from 'zod';
import { LANGS, type Lang } from './content.ts';

/** Same rule as the `<!-- screenshot name="…" -->` directive. */
export const SHOT_NAME = /^[a-z0-9-]{1,60}$/;

const Size = z.object({
  width: z.number().int().min(1).max(4000),
  height: z.number().int().min(1).max(4000),
});
export type ShotSize = z.infer<typeof Size>;

/** `content/screenshots.json`: each name that has images, with their size in pixels. */
export const Screenshots = z
  .record(z.string().regex(SHOT_NAME), Size)
  .refine((r) => Object.keys(r).length <= 500);

/** A source file named `<name>.<lang>.png` (or .jpg/.jpeg), e.g. `m4-connected.de.png`. */
export function parseShotFile(file: string): { name: string; lang: Lang } | null {
  const base = file.split('/').pop() ?? '';
  const m = /^(.+)\.([a-z]{2})\.(?:png|jpe?g)$/i.exec(base);
  if (!m?.[1] || !m[2]) return null;
  const name = m[1];
  const lang = LANGS.find((l) => l === m[2]?.toLowerCase());
  if (!lang || !SHOT_NAME.test(name)) return null;
  return { name, lang };
}

/** The image path a page uses for a screenshot. */
export function shotPath(name: string, lang: Lang): string {
  return `/img/${name}.${lang}.webp`;
}

/** Adds or replaces entries; the result is sorted by name. */
export function mergeShots(
  existing: Readonly<Record<string, ShotSize>>,
  added: Readonly<Record<string, ShotSize>>,
): Record<string, ShotSize> {
  const all: Record<string, ShotSize> = { ...existing, ...added };
  return Object.fromEntries(
    Object.keys(all)
      .sort()
      .map((k) => [k, all[k] as ShotSize]),
  );
}
