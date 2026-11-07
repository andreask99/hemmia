/**
 * The relay's own certificate for api., tunnel. and join.<relay-domain> (RELAY.md §6): key and
 * chain in <dataDir>/tls/, obtained before listening, renewed when less than a third of its
 * lifetime is left (checked every 12 h) and swapped into the TLS server in place.
 */
import { generateKeyPairSync, createPrivateKey, X509Certificate } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Logger } from 'pino';
import { buildCsr } from '@hemmia/relay-protocol';
import type { Issuer } from '../acme/queue.ts';

export function ownNames(domain: string): string[] {
  return [`api.${domain}`, `tunnel.${domain}`, `join.${domain}`];
}

/** True when less than a third of the certificate's lifetime is left (or it can't be read). */
export function needsRenewal(chainPem: string, nowMs: number): boolean {
  try {
    const cert = new X509Certificate(chainPem);
    const from = Date.parse(cert.validFrom);
    const to = Date.parse(cert.validTo);
    return to - nowMs < (to - from) / 3;
  } catch {
    return true;
  }
}

function writePrivate(path: string, text: string): void {
  writeFileSync(`${path}.tmp`, text, { mode: 0o600 });
  renameSync(`${path}.tmp`, path);
  chmodSync(path, 0o600);
}

export function createOwnCertificate(o: {
  dataDir: string;
  domain: string;
  issuer: Issuer;
  log: Logger;
  now?: () => number;
  onChange: (cert: string, key: string) => void;
}) {
  const now = o.now ?? Date.now;
  const dir = join(o.dataDir, 'tls');
  const keyFile = join(dir, 'relay-key.pem');
  const chainFile = join(dir, 'relay-chain.pem');
  let timer: NodeJS.Timeout | null = null;

  function key(): string {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
    if (existsSync(keyFile)) return readFileSync(keyFile, 'utf8');
    const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    writePrivate(keyFile, pem);
    return pem;
  }

  /** The current certificate, obtaining or renewing it first when needed. */
  async function ensure(): Promise<{ cert: string; key: string }> {
    const k = key();
    const current = existsSync(chainFile) ? readFileSync(chainFile, 'utf8') : null;
    if (current && !needsRenewal(current, now())) return { cert: current, key: k };
    const csr = buildCsr(createPrivateKey(k), ownNames(o.domain));
    const chain = await o.issuer.issue(ownNames(o.domain), csr, AbortSignal.timeout(5 * 60_000));
    writePrivate(chainFile, chain);
    o.log.info('relay certificate issued');
    return { cert: chain, key: k };
  }

  return {
    ensure,
    /** Checks every 12 h and swaps a renewed certificate in. */
    start(intervalMs = 12 * 60 * 60_000): void {
      timer = setInterval(() => {
        const before = existsSync(chainFile) ? readFileSync(chainFile, 'utf8') : null;
        ensure()
          .then((c) => {
            if (c.cert !== before) o.onChange(c.cert, c.key);
          })
          .catch(() => {
            o.log.error('relay certificate renewal failed');
          });
      }, intervalMs);
      timer.unref();
    },
    stop(): void {
      if (timer) clearInterval(timer);
    },
  };
}
