import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generateKeyPairSync, type KeyObject, X509Certificate } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { buildCsr, CertificateStatus, signRequest } from '@hemmia/relay-protocol';
import { createAcmeClient } from '../acme/client.ts';
import { startFakeAcme } from '../acme/fake-server.ts';
import { createOrderQueue, type Issuer } from '../acme/queue.ts';
import { openDb, type RelayDb } from '../db.ts';
import { createFakeDns } from '../dns/fake.ts';
import { createTestCa, hasOpenssl, type TestCa } from '../../test/ca.ts';
import { newHubKey, registerInDb } from '../../test/fakehub.ts';
import { apiRequest, DOMAIN, silent } from '../../test/helpers.ts';
import { certificateRoutes } from './certificates.ts';
import { createApiHandler } from './server.ts';

const run = hasOpenssl() ? describe : describe.skip;

run('certificate orders', () => {
  let ca: TestCa;
  let acme: Awaited<ReturnType<typeof startFakeAcme>>;
  let issuer: Issuer;
  beforeAll(async () => {
    ca = createTestCa();
    const dns = createFakeDns();
    acme = await startFakeAcme({
      lookupTxt: dns.lookup,
      signCsr: (d) => ca.signCsr(d),
      chainPem: ca.certPem,
    });
    issuer = createAcmeClient({
      directoryUrl: acme.directoryUrl,
      accountKey: generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey,
      email: null,
      dns: dns.provider,
      waitForTxt: dns.wait,
      pollMs: 5,
    });
  });
  afterAll(async () => {
    await acme.close();
    ca.dispose();
  });

  let clock = Date.now();
  async function setup(withIssuer: Issuer | null = issuer) {
    const db: RelayDb = openDb(':memory:');
    const queue = withIssuer ? createOrderQueue({ db, issuer: withIssuer, log: silent }) : null;
    const routes = certificateRoutes({ db, relayDomain: DOMAIN, queue, now: () => clock });
    const server = http.createServer(
      createApiHandler({ db, relayDomain: DOMAIN, log: silent, routes, now: () => clock }),
    );
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const port = (server.address() as AddressInfo).port;
    const h = newHubKey();
    registerInDb(db, h);
    const call = (method: string, path: string, body = '', key: KeyObject = h.key) => {
      clock += 1000; // fresh signatures
      return apiRequest(port, method, path, {
        headers: signRequest({
          privateKey: key,
          hubId: h.hubId,
          method,
          pathWithQuery: path,
          relayDomain: DOMAIN,
          time: Math.floor(clock / 1000),
          body: Buffer.from(body),
        }),
        ...(body ? { body } : {}),
      });
    };
    return { db, queue, server, h, call };
  }

  it('orders a certificate for exactly the hub host', async () => {
    const s = await setup();
    const key = generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey;
    const csr = buildCsr(key, [`${s.h.hubId}.h.${DOMAIN}`]).toString('base64url');
    const created = await s.call('POST', '/v1/hubs/self/certificate', JSON.stringify({ csr }));
    expect(created.status).toBe(202);
    const { orderId } = created.body as { orderId: string };
    const again = await s.call('POST', '/v1/hubs/self/certificate', JSON.stringify({ csr }));
    expect(again).toMatchObject({ status: 409, body: { error: { code: 'order_pending' } } });
    await s.queue?.idle();
    const status = CertificateStatus.parse(
      (await s.call('GET', `/v1/hubs/self/certificate/${orderId}`)).body,
    );
    expect(status.status).toBe('ready');
    if (status.status === 'ready') {
      expect(new X509Certificate(status.chainPem).subjectAltName).toBe(
        `DNS:${s.h.hubId}.h.${DOMAIN}`,
      );
    }
    s.server.close();
  });

  it('fails orders whose CSR names another host', async () => {
    const s = await setup();
    const key = generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey;
    const csr = buildCsr(key, [`zzzzzzzzzzzz.h.${DOMAIN}`]).toString('base64url');
    const { orderId } = (await s.call('POST', '/v1/hubs/self/certificate', JSON.stringify({ csr })))
      .body as {
      orderId: string;
    };
    await s.queue?.idle();
    expect((await s.call('GET', `/v1/hubs/self/certificate/${orderId}`)).body).toEqual({
      status: 'failed',
      code: 'csr_rejected',
    });
    s.server.close();
  });

  it('allows 5 orders per hub a week and hides other hubs orders', async () => {
    const instant: Issuer = { issue: () => Promise.reject(new Error('x')) };
    const s = await setup(instant);
    const csr = buildCsr(generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey, [
      'a.test',
    ]).toString('base64url');
    let last = '';
    for (let i = 0; i < 5; i++) {
      const r = await s.call('POST', '/v1/hubs/self/certificate', JSON.stringify({ csr }));
      expect(r.status).toBe(202);
      last = (r.body as { orderId: string }).orderId;
      await s.queue?.idle();
    }
    expect(
      await s.call('POST', '/v1/hubs/self/certificate', JSON.stringify({ csr })),
    ).toMatchObject({
      status: 429,
    });
    const other = newHubKey();
    registerInDb(s.db, other);
    clock += 1000;
    const res = await apiRequest(
      (s.server.address() as AddressInfo).port,
      'GET',
      `/v1/hubs/self/certificate/${last}`,
      {
        headers: signRequest({
          privateKey: other.key,
          hubId: other.hubId,
          method: 'GET',
          pathWithQuery: `/v1/hubs/self/certificate/${last}`,
          relayDomain: DOMAIN,
          time: Math.floor(clock / 1000),
          body: Buffer.alloc(0),
        }),
      },
    );
    expect(res.status).toBe(404);
    s.server.close();
  });

  it('answers 503 without an issuer', async () => {
    const s = await setup(null);
    expect((await s.call('POST', '/v1/hubs/self/certificate', '{"csr":"x"}')).status).toBe(503);
    s.server.close();
  });
});
