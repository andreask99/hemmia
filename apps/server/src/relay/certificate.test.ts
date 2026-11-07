import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hasOpenssl } from '@hemmia/relay/testing';
import { loadOrCreateIdentity } from '../security/relay-identity.ts';
import { createHubCertificate, CertificateError } from './certificate.ts';
import { createRelayClient } from './client.ts';
import { startTestRelay, type TestRelay } from './testrelay.ts';

(hasOpenssl() ? describe : describe.skip)('hub certificate', () => {
  let t: TestRelay;
  beforeAll(async () => {
    t = await startTestRelay();
  });
  afterAll(async () => {
    await t.dispose();
  });

  it('orders through the relay, stores it, and reuses it', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'hub-cert-'));
    try {
      const identity = loadOrCreateIdentity(dir);
      const client = createRelayClient({ endpoint: t.endpoint, identity: () => identity });
      const { hostname } = await client.register();
      let changes = 0;
      const cert = createHubCertificate({
        dataDir: dir,
        client,
        hostname: () => hostname,
        pollMs: 10,
      });
      cert.onChange(() => changes++);
      await cert.ensure();
      expect(cert.current()).not.toBeNull();
      expect(changes).toBe(1);
      expect(statSync(join(dir, 'relay', 'tls-key.pem')).mode & 0o777).toBe(0o600);
      expect(statSync(join(dir, 'relay', 'tls-chain.pem')).mode & 0o777).toBe(0o600);
      const notAfter = cert.info()?.notAfter ?? 0;
      expect(notAfter).toBeGreaterThan(Date.now());
      // A second hub process with the same files needs no new order.
      let ordered = 0;
      const again = createHubCertificate({
        dataDir: dir,
        client: {
          orderCertificate: () => {
            ordered++;
            return Promise.resolve('x');
          },
          certificateStatus: () => Promise.resolve(null),
        },
        hostname: () => hostname,
      });
      await again.ensure();
      expect(ordered).toBe(0);
      expect(again.info()?.notAfter).toBe(notAfter);
      // Late in its life: renewed with the same key.
      const late = createHubCertificate({
        dataDir: dir,
        client,
        hostname: () => hostname,
        now: () => notAfter - 24 * 60 * 60_000,
        pollMs: 10,
      });
      await late.ensure();
      expect(late.info()?.notAfter).toBeGreaterThanOrEqual(notAfter);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reports failed and timed-out orders', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'hub-cert-'));
    try {
      const failing = createHubCertificate({
        dataDir: dir,
        client: {
          orderCertificate: () => Promise.resolve('o'),
          certificateStatus: () => Promise.resolve({ status: 'failed', code: 'dns_failed' }),
        },
        hostname: () => 'zt0jr4qknd6e.h.relay.test',
      });
      await expect(failing.ensure()).rejects.toMatchObject({ code: 'dns_failed' });
      let clock = 0;
      const slow = createHubCertificate({
        dataDir: dir,
        client: {
          orderCertificate: () => Promise.resolve('o'),
          certificateStatus: () => {
            clock += 60_000;
            return Promise.resolve({ status: 'pending' });
          },
        },
        hostname: () => 'zt0jr4qknd6e.h.relay.test',
        now: () => clock,
        pollMs: 1,
      });
      const err = await slow.ensure().catch((e: unknown) => e);
      expect(err).toBeInstanceOf(CertificateError);
      expect((err as CertificateError).code).toBe('timeout');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
