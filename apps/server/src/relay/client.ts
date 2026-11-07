/**
 * The hub's client for the relay's control API (RELAY.md §5): registration, self, forget,
 * certificate orders. Requests are signed with the hub identity; TLS is checked against the
 * system roots (plus a development CA when configured). Owned by Claude.
 */
import { createHash } from 'node:crypto';
import https from 'node:https';
import tls from 'node:tls';
import type { z } from 'zod';
import {
  ApiError,
  type ApiErrorCode,
  CertificateOrderResponse,
  CertificateStatus,
  HubSelfResponse,
  type PushHandleRequest,
  PushHandleResponse,
  type PushSendRequest,
  RegisterResponse,
  signRegistration,
  signRequest,
} from '@hemmia/relay-protocol';
import type { RelayIdentity } from '../security/relay-identity.ts';

export class RelayApiError extends Error {
  override name = 'RelayApiError';
  readonly status: number;
  readonly code: ApiErrorCode | 'unreachable';
  constructor(status: number, code: ApiErrorCode | 'unreachable') {
    super(code);
    this.status = status;
    this.code = code;
  }
}

export interface RelayEndpoint {
  domain: string;
  /** Development: connect here instead of what DNS says. */
  address: { host: string; port: number } | null;
  /** Development: an extra CA to trust. */
  ca: string | null;
}

/** TLS trust for relay connections: the system roots, plus the development CA if any. */
export function relayTrust(endpoint: RelayEndpoint): string[] | undefined {
  return endpoint.ca ? [...tls.rootCertificates, endpoint.ca] : undefined;
}

export function createRelayClient(o: {
  endpoint: RelayEndpoint;
  identity: () => RelayIdentity;
  now?: () => number;
  timeoutMs?: number;
}) {
  const now = o.now ?? Date.now;
  const apiHost = `api.${o.endpoint.domain}`;
  /**
   * Ed25519 signatures are deterministic: the same request in the same second would carry the
   * same signature, which the relay refuses as a replay. Such a repeat waits for the next second.
   */
  const lastSent = new Map<string, number>();
  async function signingTime(key: string): Promise<number> {
    let t = Math.floor(now() / 1000);
    while (lastSent.get(key) === t) {
      await new Promise((r) => setTimeout(r, 1000 - (now() % 1000) + 5));
      t = Math.floor(now() / 1000);
    }
    lastSent.set(key, t);
    if (lastSent.size > 100) lastSent.delete(lastSent.keys().next().value ?? '');
    return t;
  }

  async function request(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    body: unknown,
    signed: boolean,
  ): Promise<{ status: number; json: unknown }> {
    const raw = body === undefined ? Buffer.alloc(0) : Buffer.from(JSON.stringify(body));
    const identity = signed ? o.identity() : null;
    const time = signed
      ? await signingTime(`${method} ${path} ${shortFingerprint(raw.toString('base64'))}`)
      : 0;
    const headers: Record<string, string> = {
      host: apiHost,
      accept: 'application/json',
      'user-agent': 'hemmia-hub',
      ...(raw.length > 0 ? { 'content-type': 'application/json' } : {}),
      'content-length': String(raw.length),
      ...(identity
        ? signRequest({
            privateKey: identity.key,
            hubId: identity.hubId,
            method,
            pathWithQuery: path,
            relayDomain: o.endpoint.domain,
            time,
            body: raw,
          })
        : {}),
    };
    const ca = relayTrust(o.endpoint);
    return new Promise((resolve, reject) => {
      const req = https.request(
        {
          host: o.endpoint.address?.host ?? apiHost,
          port: o.endpoint.address?.port ?? 443,
          servername: apiHost,
          method,
          path,
          headers,
          ...(ca ? { ca } : {}),
          timeout: o.timeoutMs ?? 15_000,
          agent: false,
        },
        (res) => {
          const chunks: Buffer[] = [];
          let size = 0;
          res.on('data', (c: Buffer) => {
            size += c.length;
            if (size > 64 * 1024) {
              req.destroy(new Error('response too large'));
              return;
            }
            chunks.push(c);
          });
          res.on('end', () => {
            const text = Buffer.concat(chunks).toString('utf8');
            let json: unknown;
            try {
              json = text === '' ? null : (JSON.parse(text) as unknown);
            } catch {
              json = null;
            }
            resolve({ status: res.statusCode ?? 0, json });
          });
        },
      );
      req.on('timeout', () => req.destroy(new Error('timeout')));
      req.on('error', () => {
        reject(new RelayApiError(0, 'unreachable'));
      });
      req.end(raw);
    });
  }

  async function call<T>(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    body: unknown,
    signed: boolean,
    schema: z.ZodType<T> | null,
    ok: number[],
  ): Promise<{ status: number; value: T | null }> {
    const res = await request(method, path, body, signed);
    if (!ok.includes(res.status)) {
      const err = ApiError.safeParse(res.json);
      throw new RelayApiError(res.status, err.success ? err.data.error.code : 'internal');
    }
    return { status: res.status, value: schema ? schema.parse(res.json) : null };
  }

  return {
    /** Registers (or confirms) this hub's key; returns its address. */
    async register() {
      const identity = o.identity();
      const body = signRegistration(identity.key, Math.floor(now() / 1000));
      const r = await call('POST', '/v1/hubs', body, false, RegisterResponse, [200, 201]);
      if (!r.value || r.value.hubId !== identity.hubId)
        throw new RelayApiError(r.status, 'internal');
      return r.value;
    },
    async self() {
      return (await call('GET', '/v1/hubs/self', undefined, true, HubSelfResponse, [200])).value;
    },
    async forget(): Promise<void> {
      await call('DELETE', '/v1/hubs/self', undefined, true, null, [204]);
    },
    async orderCertificate(csrDer: Buffer): Promise<string> {
      const r = await call(
        'POST',
        '/v1/hubs/self/certificate',
        { csr: csrDer.toString('base64url') },
        true,
        CertificateOrderResponse,
        [202],
      );
      return r.value?.orderId ?? '';
    },
    /** Registers a device token at the relay; returns the opaque handle. */
    async pushHandle(body: PushHandleRequest): Promise<string> {
      const r = await call('POST', '/v1/push/handles', body, true, PushHandleResponse, [201]);
      return r.value?.handle ?? '';
    },
    async deletePushHandle(handle: string): Promise<void> {
      await call('DELETE', `/v1/push/handles/${handle}`, undefined, true, null, [204]);
    },
    /** 'ok', or 'gone' when the token is dead (the relay deleted the handle). */
    async pushSend(body: PushSendRequest): Promise<'ok' | 'gone'> {
      try {
        await call('POST', '/v1/push/send', body, true, null, [202]);
        return 'ok';
      } catch (err) {
        if (err instanceof RelayApiError && (err.code === 'gone' || err.code === 'unknown_handle'))
          return 'gone';
        throw err;
      }
    },
    async certificateStatus(orderId: string) {
      return (
        await call(
          'GET',
          `/v1/hubs/self/certificate/${orderId}`,
          undefined,
          true,
          CertificateStatus,
          [200],
        )
      ).value;
    },
  };
}
export type RelayClient = ReturnType<typeof createRelayClient>;

/** Fingerprint used in logs instead of anything secret (first 8 hex of SHA-256). */
export function shortFingerprint(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 8);
}
