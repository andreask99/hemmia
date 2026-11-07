/**
 * The phone-mode export file (PHONE-MODE.md §7): all chats of "kchat on this phone" in one
 * unencrypted JSON file, for moving to another phone or a home hub (P9.8). The format name is
 * a protocol constant (not renamed in P8.2).
 */
import { z } from 'zod';

export const PHONE_EXPORT_FORMAT = 'kchat-phone-export';

/** One photo: base64 JPEG without a data: prefix, at most ~3 MB of base64. */
const Photo = z
  .string()
  .regex(/^[A-Za-z0-9+/]+={0,2}$/)
  .max(3_000_000);

export const PhoneExportMessage = z
  .object({
    role: z.enum(['user', 'assistant']),
    text: z.string().max(1_000_000),
    createdAt: z.number().int().nonnegative(),
    model: z.string().max(200).optional(),
    photos: z.array(Photo).max(10).optional(),
    stopped: z.literal(true).optional(),
  })
  .strict();
export type PhoneExportMessage = z.infer<typeof PhoneExportMessage>;

export const PhoneExportChat = z
  .object({
    id: z.string().max(64),
    title: z.string().max(200),
    createdAt: z.number().int().nonnegative(),
    model: z.string().max(200),
    messages: z.array(PhoneExportMessage).max(2000),
  })
  .strict();
export type PhoneExportChat = z.infer<typeof PhoneExportChat>;

export const PhoneExport = z
  .object({
    format: z.literal(PHONE_EXPORT_FORMAT),
    version: z.literal(1),
    exportedAt: z.number().int().nonnegative(),
    aboutMe: z.string().max(4000),
    chats: z.array(PhoneExportChat).max(2000),
  })
  .strict();
export type PhoneExport = z.infer<typeof PhoneExport>;

/** POST /api/import/phone: what was imported. */
export const PhoneImportResponse = z.object({
  chats: z.number().int().nonnegative(),
  messages: z.number().int().nonnegative(),
  photos: z.number().int().nonnegative(),
  photosSkipped: z.number().int().nonnegative(),
});
export type PhoneImportResponse = z.infer<typeof PhoneImportResponse>;
