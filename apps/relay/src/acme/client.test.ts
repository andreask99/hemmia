import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generateKeyPairSync, X509Certificate } from 'node:crypto';
import { createFakeDns } from '../dns/fake.ts';
import { createCloudflareDns } from '../dns/cloudflare.ts';
import { createTestCa, hasOpenssl, makeCsr, type TestCa } from '../../test/ca.ts';
import { accountUrlFor, AcmeOrderError, createAcmeClient } from './client.ts';
import { startFakeAcme } from './fake-server.ts';

const run = hasOpenssl() ? describe : describe.skip;
const NAME = 'zt0jr4qknd6e.h.relay.test';

run('ACME client against the fake CA', () => {
  let ca: TestCa;
  beforeAll(() => {
    ca = createTestCa();
  });
  afterAll(() => {
    ca.dispose();
  });

  async function setup(
    o: { badNonces?: number; neverValidate?: boolean; failSet?: boolean; lie?: boolean } = {},
  ) {
    const dns = createFakeDns({ ...(o.failSet ? { failSet: true } : {}) });
    const acme = await startFakeAcme({
      // `lie`: the waiter says the record is there, but the CA sees something else.
      lookupTxt: (n) => (o.lie ? ['wrong'] : dns.lookup(n)),
      signCsr: (der) => ca.signCsr(der),
      chainPem: ca.certPem,
      ...(o.badNonces ? { badNonces: o.badNonces } : {}),
      ...(o.neverValidate ? { neverValidate: true } : {}),
    });
    let stored: string | null = null;
    const client = createAcmeClient({
      directoryUrl: acme.directoryUrl,
      accountKey: generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey,
      email: 'relay@example.test',
      dns: dns.provider,
      waitForTxt: o.lie ? () => Promise.resolve() : dns.wait,
      onAccountUrl: (u) => (stored = u),
      pollMs: 5,
      authzTimeoutMs: 200,
    });
    return { dns, acme, client, stored: () => stored };
  }

  it('issues a certificate for the CSR and deletes the TXT record', async () => {
    const s = await setup();
    const csr = makeCsr([NAME]);
    const pem = await s.client.issue([NAME], csr.der, AbortSignal.timeout(10_000));
    const leaf = new X509Certificate(pem);
    expect(leaf.subjectAltName).toBe(`DNS:${NAME}`);
    expect(leaf.checkIssued(new X509Certificate(ca.certPem))).toBe(true);
    expect(pem.split('-----BEGIN CERTIFICATE-----').length - 1).toBe(2);
    expect(s.dns.count()).toBe(0);
    expect(s.stored()).toMatch(/\/acct\/\d+$/);
    // A second order reuses the account.
    await s.client.issue([NAME], csr.der, AbortSignal.timeout(10_000));
    expect(s.acme.stats.finalized).toBe(2);
    await s.acme.close();
  });

  it('covers several names in one order (the relay certificate)', async () => {
    const s = await setup();
    const names = ['api.relay.test', 'tunnel.relay.test', 'join.relay.test'];
    const pem = await s.client.issue(names, makeCsr(names).der, AbortSignal.timeout(10_000));
    expect(new X509Certificate(pem).subjectAltName).toBe(names.map((n) => `DNS:${n}`).join(', '));
    await s.acme.close();
  });

  it('retries once on badNonce', async () => {
    const s = await setup({ badNonces: 1 });
    await s.client.issue([NAME], makeCsr([NAME]).der, AbortSignal.timeout(10_000));
    expect(s.acme.stats.badNonceSent).toBe(1);
    await s.acme.close();
  });

  it('fails acme_failed when the authorization turns invalid, and cleans up', async () => {
    const s = await setup({ lie: true });
    const err = await s.client
      .issue([NAME], makeCsr([NAME]).der, AbortSignal.timeout(10_000))
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AcmeOrderError);
    expect((err as AcmeOrderError).code).toBe('acme_failed');
    expect(s.dns.count()).toBe(0);
    await s.acme.close();
  });

  it('fails dns_failed when the record cannot be set', async () => {
    const s = await setup({ failSet: true });
    await expect(
      s.client.issue([NAME], makeCsr([NAME]).der, AbortSignal.timeout(10_000)),
    ).rejects.toMatchObject({
      code: 'dns_failed',
    });
    await s.acme.close();
  });

  it('times out an authorization that stays pending, and cleans up', async () => {
    const s = await setup({ neverValidate: true });
    await expect(
      s.client.issue([NAME], makeCsr([NAME]).der, AbortSignal.timeout(10_000)),
    ).rejects.toMatchObject({
      code: 'timeout',
    });
    expect(s.dns.count()).toBe(0);
    await s.acme.close();
  });

  it('reports csr_rejected for a CSR with other names', async () => {
    const s = await setup();
    await expect(
      s.client.issue([NAME], makeCsr(['other.h.relay.test']).der, AbortSignal.timeout(10_000)),
    ).rejects.toMatchObject({ code: 'csr_rejected' });
    await s.acme.close();
  });
});

describe('Cloudflare DNS provider', () => {
  it('creates and deletes TXT records with the zone token', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const dns = createCloudflareDns({
      token: 'cf-token-abcdefghijklmnopqrstuvwxyz',
      zoneId: '0123456789abcdef0123456789abcdef',
      fetch: (url, init) => {
        calls.push({ url, init });
        return Promise.resolve(
          init.method === 'POST'
            ? new Response(
                JSON.stringify({
                  success: true,
                  result: { id: 'ffffffffffffffffffffffffffffffff' },
                }),
              )
            : new Response('{}'),
        );
      },
    });
    const id = await dns.setTxt('_acme-challenge.x.h.relay.test', 'value');
    expect(id).toBe('ffffffffffffffffffffffffffffffff');
    await dns.deleteTxt(id);
    expect(calls.map((c) => [c.init.method, c.url])).toEqual([
      [
        'POST',
        'https://api.cloudflare.com/client/v4/zones/0123456789abcdef0123456789abcdef/dns_records',
      ],
      [
        'DELETE',
        'https://api.cloudflare.com/client/v4/zones/0123456789abcdef0123456789abcdef/dns_records/ffffffffffffffffffffffffffffffff',
      ],
    ]);
    expect(JSON.parse(calls[0]?.init.body as string)).toEqual({
      type: 'TXT',
      name: '_acme-challenge.x.h.relay.test',
      content: 'value',
      ttl: 60,
    });
    expect((calls[0]?.init.headers as Record<string, string>).authorization).toBe(
      'Bearer cf-token-abcdefghijklmnopqrstuvwxyz',
    );
    await expect(dns.deleteTxt('../zones')).rejects.toThrow();
  });

  it('fails clearly when Cloudflare refuses', async () => {
    const dns = createCloudflareDns({
      token: 'cf-token-abcdefghijklmnopqrstuvwxyz',
      zoneId: '0123456789abcdef0123456789abcdef',
      fetch: () => Promise.resolve(new Response('{"success":false}', { status: 403 })),
    });
    await expect(dns.setTxt('a', 'b')).rejects.toThrow('cloudflare: create failed (403)');
  });
});

describe('accountUrlFor', () => {
  const staging = 'https://acme-staging-v02.api.letsencrypt.org/directory';
  const production = 'https://acme-v02.api.letsencrypt.org/directory';
  const stagingAccount = 'https://acme-staging-v02.api.letsencrypt.org/acme/acct/123';

  it('keeps an account of the same ACME server', () => {
    expect(accountUrlFor(stagingAccount, staging)).toBe(stagingAccount);
  });

  it('drops an account of another server, so the key registers anew', () => {
    expect(accountUrlFor(stagingAccount, production)).toBeNull();
  });

  it('handles nothing saved and unreadable values', () => {
    expect(accountUrlFor(null, production)).toBeNull();
    expect(accountUrlFor('not a url', production)).toBeNull();
  });
});
