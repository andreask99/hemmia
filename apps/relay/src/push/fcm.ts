/**
 * Firebase Cloud Messaging HTTP v1 (RELAY.md §7.2): an OAuth access token from the service
 * account (RS256 JWT exchanged at Google's token endpoint, cached until 5 minutes before it
 * expires), then one send per notification. Content-free, like APNs. Owned by Claude.
 */
import { createPrivateKey, sign } from 'node:crypto';
import { z } from 'zod';
import type { PushMessage, PushSender, SendResult } from './sender.ts';

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export const ServiceAccount = z.object({
  client_email: z.email(),
  private_key: z.string().includes('PRIVATE KEY'),
});

const TokenResponse = z.object({
  access_token: z.string().min(10),
  expires_in: z.number().int().positive(),
});
const ErrorBody = z
  .object({
    error: z
      .object({
        status: z.string().optional(),
        details: z.array(z.object({ errorCode: z.string().optional() }).loose()).optional(),
        message: z.string().optional(),
      })
      .loose(),
  })
  .loose();

const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');

export function fcmBody(token: string, m: PushMessage): string {
  return JSON.stringify({
    message: {
      token,
      data: { k: m.kind, r: m.ref, h: m.hubHost },
      android: {
        priority: 'HIGH',
        ttl: '86400s',
        collapse_key: m.kind,
        notification: {
          title_loc_key: `push_${m.kind}_title`,
          body_loc_key: `push_${m.kind}_body`,
          channel_id: 'replies',
          tag: m.kind,
        },
      },
    },
  });
}

export function createFcmSender(o: {
  serviceAccount: z.infer<typeof ServiceAccount>;
  projectId: string;
  fetch?: FetchLike;
  now?: () => number;
}): PushSender {
  const fetchImpl: FetchLike = o.fetch ?? ((url, init) => fetch(url, init));
  const now = o.now ?? Date.now;
  const key = createPrivateKey(o.serviceAccount.private_key);
  let access: { token: string; expiresAt: number } | null = null;

  async function accessToken(): Promise<string | null> {
    if (access && now() < access.expiresAt - 5 * 60_000) return access.token;
    const iat = Math.floor(now() / 1000);
    const head = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
      iss: o.serviceAccount.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat,
      exp: iat + 3600,
    })}`;
    const assertion = `${head}.${sign('sha256', Buffer.from(head), key).toString('base64url')}`;
    try {
      const res = await fetchImpl('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
          assertion,
        }).toString(),
        redirect: 'error',
        signal: AbortSignal.timeout(15_000),
      });
      const parsed = TokenResponse.safeParse(await res.json().catch(() => null));
      if (!res.ok || !parsed.success) return null;
      access = {
        token: parsed.data.access_token,
        expiresAt: now() + parsed.data.expires_in * 1000,
      };
      return access.token;
    } catch {
      return null;
    }
  }

  return {
    async send(platform, _env, deviceToken, m): Promise<SendResult> {
      if (platform !== 'android' || !/^[A-Za-z0-9_:-]{1,4096}$/.test(deviceToken)) return 'error';
      const bearer = await accessToken();
      if (!bearer) return 'error';
      let res: Response;
      try {
        res = await fetchImpl(
          `https://fcm.googleapis.com/v1/projects/${o.projectId}/messages:send`,
          {
            method: 'POST',
            headers: { authorization: `Bearer ${bearer}`, 'content-type': 'application/json' },
            body: fcmBody(deviceToken, m),
            redirect: 'error',
            signal: AbortSignal.timeout(15_000),
          },
        );
      } catch {
        return 'error';
      }
      if (res.ok) {
        await res.body?.cancel().catch(() => undefined);
        return 'ok';
      }
      if (res.status === 401) access = null;
      const err = ErrorBody.safeParse(await res.json().catch(() => null));
      const codes = err.success ? (err.data.error.details ?? []).map((d) => d.errorCode) : [];
      const status = err.success ? err.data.error.status : undefined;
      if (res.status === 404 || status === 'NOT_FOUND' || codes.includes('UNREGISTERED'))
        return 'gone';
      if (
        status === 'INVALID_ARGUMENT' &&
        /registration token|message\.token/i.test(err.success ? (err.data.error.message ?? '') : '')
      ) {
        return 'gone';
      }
      return 'error';
    },
  };
}
