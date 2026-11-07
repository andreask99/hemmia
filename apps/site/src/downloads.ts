/** Download buttons data, `content/downloads.json` (WEBSITE.md §6). */
import { z } from 'zod';

export const Platform = z.enum(['ios', 'android', 'macos', 'docker']);
export type Platform = z.infer<typeof Platform>;

export const Download = z
  .object({
    platform: Platform,
    /** Empty until release: the card then reads "Coming soon". */
    url: z.union([z.literal(''), z.string().regex(/^https:\/\/\S+$/)]),
    version: z.string().min(1).max(40).optional(),
    note: z.object({ en: z.string().max(200), de: z.string().max(200) }).strict(),
  })
  .strict();
export type Download = z.infer<typeof Download>;

export const Downloads = z
  .array(Download)
  .length(4)
  .refine((a) => new Set(a.map((d) => d.platform)).size === 4, 'each platform once');

export function parseDownloads(text: string, file = 'downloads.json'): Download[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`${file}: not valid JSON`);
  }
  const r = Downloads.safeParse(data);
  if (!r.success) throw new Error(`${file}: ${r.error.issues.map((i) => i.message).join('; ')}`);
  return r.data;
}
