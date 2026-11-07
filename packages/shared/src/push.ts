import { z } from 'zod';

const B64Url = z.string().regex(/^[A-Za-z0-9_-]+={0,2}$/);

/** GET /api/push/key */
export const PushKeyResponse = z.object({ publicKey: B64Url });
export type PushKeyResponse = z.infer<typeof PushKeyResponse>;

/** POST /api/push/subscription: the browser's PushSubscription.toJSON(). */
export const PushSubscribeRequest = z.object({
  endpoint: z.url({ protocol: /^https$/ }).max(1024),
  keys: z.object({ p256dh: B64Url.max(128), auth: B64Url.max(64) }),
});
export type PushSubscribeRequest = z.infer<typeof PushSubscribeRequest>;

/** DELETE /api/push/subscription */
export const PushUnsubscribeRequest = z.object({ endpoint: z.string().max(1024) });
export type PushUnsubscribeRequest = z.infer<typeof PushUnsubscribeRequest>;

/**
 * What a notification carries (end-to-end encrypted to the device). No chat content or
 * titles: the service worker turns `kind` into text in the user's language.
 */
export const PushPayload = z.object({
  /**
   * 'maintenance': the monthly update job finished (admins only). 'connect': Hemmia Connect
   * has been down for a while or is back (admins only, web push only).
   */
  kind: z.enum(['reply', 'image', 'maintenance', 'daily', 'week', 'evening', 'connect']),
  /** The chat to open; '' for maintenance. */
  chatId: z.string(),
  lang: z.enum(['en', 'de']),
  /** Maintenance: installed (true) or rolled back (false). Connect: back (true) or down (false). */
  ok: z.boolean().optional(),
});
export type PushPayload = z.infer<typeof PushPayload>;

/** GET /api/chats/:chatId/job: the user's reply still running in this chat, if any. */
export const ActiveJobResponse = z.object({ jobId: z.string().nullable() });
export type ActiveJobResponse = z.infer<typeof ActiveJobResponse>;

/** POST /api/push/native: a native app's device token (APNs or FCM), via the relay. */
export const NativePushRequest = z.discriminatedUnion('platform', [
  z
    .object({
      platform: z.literal('ios'),
      token: z.string().regex(/^[0-9a-fA-F]{64,200}$/),
      env: z.enum(['production', 'sandbox']).optional(),
    })
    .strict(),
  z
    .object({ platform: z.literal('android'), token: z.string().regex(/^[A-Za-z0-9_:-]{1,4096}$/) })
    .strict(),
]);
export type NativePushRequest = z.infer<typeof NativePushRequest>;

/** POST /api/push/resolve: where a tapped native notification leads. */
export const ResolvePushRequest = z.object({ ref: z.string().max(200) }).strict();
export const ResolvePushResponse = z.object({ path: z.string() });
export type ResolvePushResponse = z.infer<typeof ResolvePushResponse>;
