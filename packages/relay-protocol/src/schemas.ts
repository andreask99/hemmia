/**
 * Control API bodies and responses (RELAY.md §5, §7). Shared by the hub's relay client and the
 * relay's API, so both agree by construction. Owned by Claude.
 */
import { z } from 'zod';

const B64URL = /^[A-Za-z0-9_-]+$/;
const HubId = z.string().regex(/^[0-9a-hjkmnp-tv-z]{12}$/);

export const ApiErrorCode = z.enum([
  'not_found',
  'bad_request',
  'bad_signature',
  'blocked',
  'hub_id_taken',
  'rate_limited',
  'order_pending',
  'bad_app',
  'too_many',
  'unknown_handle',
  'gone',
  'provider_error',
  'unavailable',
  'internal',
]);
export type ApiErrorCode = z.infer<typeof ApiErrorCode>;
export const ApiError = z.object({ error: z.object({ code: ApiErrorCode }) });

export const RegisterRequest = z
  .object({
    publicKey: z.string().regex(B64URL).length(43),
    time: z.number().int().nonnegative(),
    proof: z.string().regex(B64URL).length(86),
  })
  .strict();
export type RegisterRequest = z.infer<typeof RegisterRequest>;

export const RegisterResponse = z.object({
  hubId: HubId,
  hostname: z.string(),
  tunnelHost: z.string(),
  apiHost: z.string(),
});
export type RegisterResponse = z.infer<typeof RegisterResponse>;

export const HubSelfResponse = z.object({
  hubId: HubId,
  hostname: z.string(),
  connected: z.boolean(),
  quota: z.object({
    month: z.string().regex(/^\d{4}-\d{2}$/),
    bytes: z.number().int().nonnegative(),
    limitBytes: z.number().int().nonnegative(),
  }),
  blocked: z.literal(false),
});
export type HubSelfResponse = z.infer<typeof HubSelfResponse>;

export const CertificateRequest = z
  .object({ csr: z.string().regex(B64URL).min(100).max(5462) })
  .strict();
export type CertificateRequest = z.infer<typeof CertificateRequest>;

export const CertificateOrderResponse = z.object({ orderId: z.uuid() });
export type CertificateOrderResponse = z.infer<typeof CertificateOrderResponse>;

export const OrderFailure = z.enum(['csr_rejected', 'dns_failed', 'acme_failed', 'timeout']);
export type OrderFailure = z.infer<typeof OrderFailure>;

export const CertificateStatus = z.discriminatedUnion('status', [
  z.object({ status: z.literal('pending') }),
  z.object({ status: z.literal('ready'), chainPem: z.string().max(32768) }),
  z.object({ status: z.literal('failed'), code: OrderFailure }),
]);
export type CertificateStatus = z.infer<typeof CertificateStatus>;

export const PushKind = z.enum([
  'reply',
  'image',
  'daily',
  'week',
  'evening',
  'maintenance_ok',
  'maintenance_failed',
]);
export type PushKind = z.infer<typeof PushKind>;

export const PushHandleRequest = z.discriminatedUnion('platform', [
  z
    .object({
      platform: z.literal('ios'),
      token: z.string().regex(/^[0-9a-fA-F]{64,200}$/),
      env: z.enum(['production', 'sandbox']),
      appId: z.string().max(200),
    })
    .strict(),
  z
    .object({
      platform: z.literal('android'),
      token: z.string().regex(/^[A-Za-z0-9_:-]{1,4096}$/),
      appId: z.string().max(200),
    })
    .strict(),
]);
export type PushHandleRequest = z.infer<typeof PushHandleRequest>;

export const PushHandle = z.string().regex(B64URL).length(43);
export const PushHandleResponse = z.object({ handle: PushHandle });
export type PushHandleResponse = z.infer<typeof PushHandleResponse>;

export const PushSendRequest = z
  .object({
    handle: PushHandle,
    kind: PushKind,
    ref: z.string().regex(B64URL).max(200),
  })
  .strict();
export type PushSendRequest = z.infer<typeof PushSendRequest>;

export const HealthResponse = z.object({ status: z.literal('ok') });

/** Largest control API body, bytes. */
export const MAX_API_BODY = 16 * 1024;
