/**
 * Apple Push Notification service (RELAY.md §7.2): HTTP/2 with token auth (ES256 JWT from the
 * .p8 key, reused for 50 minutes). The notification is content-free: localized title and body
 * keys, the kind, the opaque ref and the hub host. Owned by Claude.
 */
import { createPrivateKey, type KeyObject, sign } from 'node:crypto';
import http2 from 'node:http2';
import type { PushMessage, PushSender, SendResult } from './sender.ts';

const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');

export function apnsJwt(key: KeyObject, keyId: string, teamId: string, iat: number): string {
  const head = `${b64({ alg: 'ES256', kid: keyId })}.${b64({ iss: teamId, iat })}`;
  const sig = sign('sha256', Buffer.from(head), { key, dsaEncoding: 'ieee-p1363' });
  return `${head}.${sig.toString('base64url')}`;
}

export function apnsBody(m: PushMessage): string {
  return JSON.stringify({
    aps: {
      alert: { 'title-loc-key': `push_${m.kind}_title`, 'loc-key': `push_${m.kind}_body` },
      sound: 'default',
      'thread-id': m.hubId,
    },
    k: m.kind,
    r: m.ref,
    h: m.hubHost,
  });
}

export function createApnsSender(o: {
  keyPem: string;
  keyId: string;
  teamId: string;
  topic: string;
  /** Tests: another origin per environment, and its CA. */
  origins?: { production: string; sandbox: string };
  ca?: string;
  now?: () => number;
  retryDelayMs?: number;
}): PushSender & { close(): void } {
  const key = createPrivateKey(o.keyPem);
  const now = o.now ?? Date.now;
  const origins = o.origins ?? {
    production: 'https://api.push.apple.com',
    sandbox: 'https://api.sandbox.push.apple.com',
  };
  let jwt: { token: string; at: number } | null = null;
  const sessions = new Map<string, http2.ClientHttp2Session>();

  const token = () => {
    if (!jwt || now() - jwt.at > 50 * 60_000) {
      jwt = { token: apnsJwt(key, o.keyId, o.teamId, Math.floor(now() / 1000)), at: now() };
    }
    return jwt.token;
  };

  function session(origin: string): http2.ClientHttp2Session {
    const s = sessions.get(origin);
    if (s && !s.closed && !s.destroyed) return s;
    const created = http2.connect(origin, o.ca ? { ca: o.ca } : {});
    created.on('error', () => {
      sessions.delete(origin);
    });
    created.on('close', () => {
      sessions.delete(origin);
    });
    created.unref();
    sessions.set(origin, created);
    return created;
  }

  function once(
    origin: string,
    deviceToken: string,
    m: PushMessage,
  ): Promise<{ status: number; reason: string | null }> {
    return new Promise((resolve) => {
      let req: http2.ClientHttp2Stream;
      try {
        req = session(origin).request({
          ':method': 'POST',
          ':path': `/3/device/${deviceToken}`,
          authorization: `bearer ${token()}`,
          'apns-topic': o.topic,
          'apns-push-type': 'alert',
          'apns-priority': '10',
          'apns-expiration': String(Math.floor(now() / 1000) + 86400),
          'apns-collapse-id': m.kind,
          'content-type': 'application/json',
        });
      } catch {
        resolve({ status: 0, reason: null });
        return;
      }
      let status = 0;
      let text = '';
      req.setTimeout(15_000, () => {
        req.close(http2.constants.NGHTTP2_CANCEL);
      });
      req.on('response', (h) => {
        status = h[':status'] ?? 0;
      });
      req.setEncoding('utf8');
      req.on('data', (c: string) => {
        if (text.length < 4096) text += c;
      });
      req.on('end', () => {
        let reason: string | null;
        try {
          const r = (JSON.parse(text) as { reason?: unknown }).reason;
          reason = typeof r === 'string' ? r : null;
        } catch {
          reason = null;
        }
        resolve({ status, reason });
      });
      req.on('error', () => {
        resolve({ status: 0, reason: null });
      });
      req.end(apnsBody(m));
    });
  }

  return {
    async send(platform, env, deviceToken, m): Promise<SendResult> {
      if (platform !== 'ios' || !/^[0-9a-fA-F]{64,200}$/.test(deviceToken)) return 'error';
      const origin = origins[env];
      for (let attempt = 0; attempt < 2; attempt++) {
        const r = await once(origin, deviceToken, m);
        if (r.status === 200) return 'ok';
        if (r.status === 410) return 'gone';
        if (
          r.status === 400 &&
          (r.reason === 'BadDeviceToken' || r.reason === 'DeviceTokenNotForTopic')
        )
          return 'gone';
        if ((r.status >= 500 || r.status === 0) && attempt === 0) {
          await new Promise((res) => setTimeout(res, o.retryDelayMs ?? 2000));
          continue;
        }
        return 'error';
      }
      return 'error';
    },
    close() {
      for (const s of sessions.values()) s.close();
      sessions.clear();
    },
  };
}
