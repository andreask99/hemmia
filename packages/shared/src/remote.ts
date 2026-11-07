import { z } from 'zod';

/** GET /api/admin/remote (and the answer of POST/DELETE): remote access through the relay. */
export const RemoteStatus = z.object({
  /** This build knows a relay (HEMMIA_RELAY_DOMAIN); otherwise remote access isn't available. */
  relayConfigured: z.boolean(),
  /** The admin turned Connect on. */
  connect: z.boolean(),
  /** <hub-id>.h.<relay-domain>, once registered. */
  hostname: z.string().nullable(),
  state: z.enum(['off', 'connecting', 'connected', 'blocked', 'error']),
  since: z.number().int(),
  lastError: z.string().nullable(),
  certificate: z.object({ notAfter: z.number().int() }).nullable(),
  quota: z.object({ bytes: z.number().int(), limitBytes: z.number().int() }).nullable(),
});
export type RemoteStatus = z.infer<typeof RemoteStatus>;

/** POST /api/admin/remote. */
export const RemoteRequest = z.object({ connect: z.boolean() }).strict();
export type RemoteRequest = z.infer<typeof RemoteRequest>;
