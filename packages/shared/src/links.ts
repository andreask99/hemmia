import { z } from 'zod';

/** POST /api/links: a sign-in link (needs the passphrase unless signed in recently) or a device code. */
export const CreateLinkRequest = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('signin'), password: z.string().max(256).optional() }).strict(),
  z.object({ kind: z.literal('device'), userId: z.string().max(64).optional() }).strict(),
]);
export type CreateLinkRequest = z.infer<typeof CreateLinkRequest>;

export const CreateLinkResponse = z.object({
  code: z.string(),
  kind: z.enum(['signin', 'device']),
  expiresAt: z.number().int(),
  /** https://join.<relay-domain>/j#1~… while remote access is on, else null. */
  shareLink: z.string().nullable(),
  /** https://<hub host>/join#… when the hub has a public address, else null. */
  directLink: z.string().nullable(),
});
export type CreateLinkResponse = z.infer<typeof CreateLinkResponse>;

/** POST /api/links/redeem: i = invite, l = sign-in link, d = device code. */
export const RedeemLinkRequest = z
  .object({ kind: z.enum(['i', 'l', 'd']), code: z.string().max(64) })
  .strict();
export type RedeemLinkRequest = z.infer<typeof RedeemLinkRequest>;

/** What the app does next: the invite screen, the app (signed in), or the login page. */
export const RedeemLinkResponse = z.object({ next: z.enum(['invite', 'app', 'login']) });
export type RedeemLinkResponse = z.infer<typeof RedeemLinkResponse>;
