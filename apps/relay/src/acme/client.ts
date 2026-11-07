/**
 * RFC 8555 client on fetch and node:crypto (RELAY.md §6): account, orders with dns-01, finalize,
 * certificate download. Every read is POST-as-GET; badNonce is retried once. The TXT record of a
 * challenge is always deleted afterwards. Owned by Claude.
 */
import type { KeyObject } from 'node:crypto';
import { z } from 'zod';
import type { DnsProvider, TxtWaiter } from '../dns/provider.ts';
import { dns01Value, publicJwk, signJws } from './jws.ts';

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export type OrderFailureCode = 'csr_rejected' | 'dns_failed' | 'acme_failed' | 'timeout';

export class AcmeOrderError extends Error {
  override name = 'AcmeOrderError';
  readonly code: OrderFailureCode;
  constructor(code: OrderFailureCode, detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
    this.code = code;
  }
}

const Directory = z.object({ newNonce: z.url(), newAccount: z.url(), newOrder: z.url() }).loose();
const Problem = z.object({ type: z.string(), detail: z.string().optional() }).loose();
const Order = z
  .object({
    status: z.enum(['pending', 'ready', 'processing', 'valid', 'invalid']),
    authorizations: z.array(z.url()),
    finalize: z.url(),
    certificate: z.url().optional(),
  })
  .loose();
const Authz = z
  .object({
    status: z.enum(['pending', 'valid', 'invalid', 'deactivated', 'expired', 'revoked']),
    identifier: z.object({ type: z.literal('dns'), value: z.string() }),
    challenges: z.array(
      z
        .object({
          type: z.string(),
          url: z.url(),
          token: z.string().optional(),
          status: z.string(),
        })
        .loose(),
    ),
  })
  .loose();

/**
 * A saved account URL, if it belongs to this ACME server: accounts don't carry over between
 * servers (Let's Encrypt staging and production), so after a switch the key registers anew.
 */
export function accountUrlFor(saved: string | null, directoryUrl: string): string | null {
  if (!saved) return null;
  try {
    return new URL(saved).origin === new URL(directoryUrl).origin ? saved : null;
  } catch {
    return null;
  }
}

export interface AcmeClientOptions {
  directoryUrl: string;
  accountKey: KeyObject;
  email: string | null;
  dns: DnsProvider;
  waitForTxt: TxtWaiter;
  /** A stored account URL (skips newAccount). */
  accountUrl?: string | null;
  onAccountUrl?: (url: string) => void;
  fetch?: FetchLike;
  pollMs?: number;
  authzTimeoutMs?: number;
}

export function createAcmeClient(o: AcmeClientOptions) {
  const fetchImpl: FetchLike = o.fetch ?? ((url, init) => fetch(url, init));
  const pollMs = o.pollMs ?? 2000;
  const jwk = publicJwk(o.accountKey);
  let directory: z.infer<typeof Directory> | null = null;
  let nonce: string | null = null;
  let kid: string | null = o.accountUrl ?? null;

  const sleep = (ms: number, signal: AbortSignal) =>
    new Promise<void>((resolve, reject) => {
      const t = setTimeout(resolve, ms);
      signal.addEventListener('abort', () => {
        clearTimeout(t);
        reject(new AcmeOrderError('timeout'));
      });
    });

  async function dir(signal: AbortSignal) {
    if (directory) return directory;
    const res = await fetchImpl(o.directoryUrl, { method: 'GET', redirect: 'error', signal });
    if (!res.ok) throw new AcmeOrderError('acme_failed', `directory ${String(res.status)}`);
    directory = Directory.parse(await res.json());
    return directory;
  }

  async function freshNonce(signal: AbortSignal): Promise<string> {
    if (nonce) {
      const n = nonce;
      nonce = null;
      return n;
    }
    const d = await dir(signal);
    const res = await fetchImpl(d.newNonce, { method: 'HEAD', redirect: 'error', signal });
    const n = res.headers.get('replay-nonce');
    if (!n) throw new AcmeOrderError('acme_failed', 'no nonce');
    return n;
  }

  /** A signed POST; `payload` null is POST-as-GET. Retries once on badNonce. */
  async function post(
    url: string,
    payload: unknown,
    signal: AbortSignal,
    opts: { useJwk?: boolean; accept?: string } = {},
  ): Promise<Response> {
    for (let attempt = 0; ; attempt++) {
      const body = signJws({
        key: o.accountKey,
        url,
        nonce: await freshNonce(signal),
        payload,
        ...(opts.useJwk || !kid ? {} : { kid }),
      });
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/jose+json',
          ...(opts.accept ? { accept: opts.accept } : {}),
        },
        body: JSON.stringify(body),
        redirect: 'error',
        signal,
      });
      nonce = res.headers.get('replay-nonce');
      if (res.ok) return res;
      const problem = Problem.safeParse(await res.json().catch(() => null));
      const type = problem.success ? problem.data.type : '';
      if (type === 'urn:ietf:params:acme:error:badNonce' && attempt === 0) continue;
      if (
        type === 'urn:ietf:params:acme:error:badCSR' ||
        type === 'urn:ietf:params:acme:error:rejectedIdentifier'
      ) {
        throw new AcmeOrderError('csr_rejected', type);
      }
      throw new AcmeOrderError('acme_failed', `${type || 'http'} ${String(res.status)}`);
    }
  }

  async function ensureAccount(signal: AbortSignal): Promise<string> {
    if (kid) return kid;
    const d = await dir(signal);
    const res = await post(
      d.newAccount,
      { termsOfServiceAgreed: true, ...(o.email ? { contact: [`mailto:${o.email}`] } : {}) },
      signal,
      { useJwk: true },
    );
    const location = res.headers.get('location');
    await res.body?.cancel().catch(() => undefined);
    if (!location) throw new AcmeOrderError('acme_failed', 'no account url');
    kid = location;
    o.onAccountUrl?.(location);
    return location;
  }

  async function poll<T extends { status: string }>(
    url: string,
    schema: z.ZodType<T>,
    done: (v: T) => boolean,
    signal: AbortSignal,
    timeoutMs: number,
  ): Promise<T> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const v = schema.parse(await (await post(url, null, signal)).json());
      if (done(v)) return v;
      if (Date.now() > deadline) throw new AcmeOrderError('timeout');
      await sleep(pollMs, signal);
    }
  }

  /** Orders a certificate for `names` with this CSR (DER); returns the PEM chain. */
  async function issue(
    names: readonly string[],
    csrDer: Buffer,
    signal: AbortSignal,
  ): Promise<string> {
    await ensureAccount(signal);
    const d = await dir(signal);
    const created = await post(
      d.newOrder,
      { identifiers: names.map((value) => ({ type: 'dns', value })) },
      signal,
    );
    const orderUrl = created.headers.get('location');
    let order = Order.parse(await created.json());
    if (!orderUrl) throw new AcmeOrderError('acme_failed', 'no order url');

    for (const authzUrl of order.authorizations) {
      const authz = Authz.parse(await (await post(authzUrl, null, signal)).json());
      if (authz.status === 'valid') continue;
      const challenge = authz.challenges.find((c) => c.type === 'dns-01');
      if (!challenge?.token) throw new AcmeOrderError('acme_failed', 'no dns-01 challenge');
      const name = `_acme-challenge.${authz.identifier.value}`;
      const value = dns01Value(challenge.token, jwk);
      let recordId: string | null = null;
      try {
        try {
          recordId = await o.dns.setTxt(name, value);
          await o.waitForTxt(name, value, signal);
        } catch (err) {
          if (err instanceof AcmeOrderError) throw err;
          throw new AcmeOrderError('dns_failed');
        }
        await (await post(challenge.url, {}, signal)).body?.cancel();
        const result = await poll(
          authzUrl,
          Authz,
          (a) => a.status !== 'pending',
          signal,
          o.authzTimeoutMs ?? 120_000,
        );
        if (result.status !== 'valid')
          throw new AcmeOrderError('acme_failed', `authorization ${result.status}`);
      } finally {
        if (recordId !== null) await o.dns.deleteTxt(recordId).catch(() => undefined);
      }
    }

    order = await poll(orderUrl, Order, (x) => x.status !== 'pending', signal, 60_000);
    if (order.status === 'invalid') throw new AcmeOrderError('acme_failed', 'order invalid');
    if (order.status === 'ready') {
      const finalized = await post(order.finalize, { csr: csrDer.toString('base64url') }, signal);
      await finalized.body?.cancel();
    }
    order = await poll(
      orderUrl,
      Order,
      (x) => x.status === 'valid' || x.status === 'invalid',
      signal,
      120_000,
    );
    if (order.status !== 'valid' || !order.certificate)
      throw new AcmeOrderError('acme_failed', 'not issued');
    const cert = await post(order.certificate, null, signal, {
      accept: 'application/pem-certificate-chain',
    });
    const pem = await cert.text();
    if (!pem.includes('-----BEGIN CERTIFICATE-----'))
      throw new AcmeOrderError('acme_failed', 'no certificate');
    return pem;
  }

  return { ensureAccount, issue };
}
export type AcmeClient = ReturnType<typeof createAcmeClient>;
