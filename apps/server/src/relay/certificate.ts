/**
 * The hub's TLS certificate for <hub-id>.h.<relay-domain> (P2.10, ARCHITECTURE.md §4.5): the key
 * (relay/tls-key.pem, P-256, 0600) never leaves the hub; the relay orders the certificate with
 * the hub's CSR. Checked daily, renewed with the same key when less than a third of its
 * lifetime is left. Owned by Claude.
 */
import {
  createPrivateKey,
  generateKeyPairSync,
  type KeyObject,
  X509Certificate,
} from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import tls from 'node:tls';
import { buildHubCsr } from '../security/csr.ts';
import { relayDir, writePrivateFile } from '../security/relay-identity.ts';
import type { RelayClient } from './client.ts';

export class CertificateError extends Error {
  override name = 'CertificateError';
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

export interface CertificateInfo {
  notAfter: number;
  notBefore: number;
}

/** Validity of a PEM chain's leaf for this host and key, or null when it doesn't fit. */
export function chainInfo(
  chainPem: string,
  hostname: string,
  key: KeyObject,
): CertificateInfo | null {
  try {
    const leaf = new X509Certificate(chainPem);
    if (leaf.subjectAltName !== `DNS:${hostname}`) return null;
    if (!leaf.checkPrivateKey(key)) return null;
    return { notBefore: Date.parse(leaf.validFrom), notAfter: Date.parse(leaf.validTo) };
  } catch {
    return null;
  }
}

export function dueForRenewal(info: CertificateInfo, nowMs: number): boolean {
  return info.notAfter - nowMs < (info.notAfter - info.notBefore) / 3;
}

export function createHubCertificate(o: {
  dataDir: string;
  client: Pick<RelayClient, 'orderCertificate' | 'certificateStatus'>;
  hostname: () => string;
  now?: () => number;
  pollMs?: number;
  orderTimeoutMs?: number;
}) {
  const now = o.now ?? Date.now;
  const keyFile = () => join(relayDir(o.dataDir), 'tls-key.pem');
  const chainFile = () => join(relayDir(o.dataDir), 'tls-chain.pem');
  const listeners = new Set<(ctx: tls.SecureContext) => void>();
  let context: tls.SecureContext | null = null;
  let info: CertificateInfo | null = null;
  let timer: NodeJS.Timeout | null = null;
  let inFlight: Promise<void> | null = null;

  function key(): { key: KeyObject; pem: string } {
    const file = keyFile();
    if (existsSync(file)) {
      const pem = readFileSync(file, 'utf8');
      return { key: createPrivateKey(pem), pem };
    }
    const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    writePrivateFile(file, pem);
    return { key: privateKey, pem };
  }

  function use(chain: string, keyPem: string, i: CertificateInfo): void {
    context = tls.createSecureContext({ cert: chain, key: keyPem, minVersion: 'TLSv1.2' });
    info = i;
    for (const l of listeners) l(context);
  }

  async function order(k: { key: KeyObject; pem: string }): Promise<void> {
    const hostname = o.hostname();
    const orderId = await o.client.orderCertificate(buildHubCsr(k.key, hostname));
    const deadline = now() + (o.orderTimeoutMs ?? 6 * 60_000);
    for (;;) {
      const status = await o.client.certificateStatus(orderId);
      if (status?.status === 'ready') {
        const i = chainInfo(status.chainPem, hostname, k.key);
        if (!i) throw new CertificateError('bad_certificate');
        writePrivateFile(chainFile(), status.chainPem);
        use(status.chainPem, k.pem, i);
        return;
      }
      if (status?.status === 'failed') throw new CertificateError(status.code);
      if (now() > deadline) throw new CertificateError('timeout');
      await new Promise((r) => setTimeout(r, o.pollMs ?? 5000));
    }
  }

  /** Loads the stored certificate, or orders one when it is missing, foreign or due. */
  async function ensure(): Promise<void> {
    if (inFlight) return inFlight;
    inFlight = (async () => {
      const k = key();
      const file = chainFile();
      if (existsSync(file)) {
        const chain = readFileSync(file, 'utf8');
        const i = chainInfo(chain, o.hostname(), k.key);
        if (i && !dueForRenewal(i, now())) {
          if (!context || info?.notAfter !== i.notAfter) use(chain, k.pem, i);
          return;
        }
      }
      await order(k);
    })().finally(() => {
      inFlight = null;
    });
    return inFlight;
  }

  return {
    ensure,
    current: () => context,
    info: () => info,
    onChange(fn: (ctx: tls.SecureContext) => void): () => void {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    /** Checks once a day; failures are retried the next day (the old certificate stays). */
    start(onError: (err: unknown) => void, intervalMs = 24 * 60 * 60_000): void {
      if (timer) return;
      timer = setInterval(() => {
        ensure().catch(onError);
      }, intervalMs);
      timer.unref();
    },
    stop(): void {
      if (timer) clearInterval(timer);
      timer = null;
    },
  };
}
export type HubCertificate = ReturnType<typeof createHubCertificate>;
