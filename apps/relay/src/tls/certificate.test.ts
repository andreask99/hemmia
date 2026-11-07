import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTestCa, hasOpenssl, type TestCa } from '../../test/ca.ts';
import { silent } from '../../test/helpers.ts';
import { createOwnCertificate, needsRenewal } from './certificate.ts';

const run = hasOpenssl() ? describe : describe.skip;

run('relay certificate lifecycle', () => {
  let ca: TestCa;
  let dir: string;
  beforeAll(() => {
    ca = createTestCa();
    dir = mkdtempSync(join(tmpdir(), 'relay-own-'));
  });
  afterAll(() => {
    ca.dispose();
    rmSync(dir, { recursive: true, force: true });
  });

  it('obtains once, keeps a fresh certificate, renews in the last third', async () => {
    let issued = 0;
    let clock = Date.now();
    const own = createOwnCertificate({
      dataDir: dir,
      domain: 'relay.test',
      issuer: {
        issue: (names, csr) => {
          issued++;
          expect(names).toEqual(['api.relay.test', 'tunnel.relay.test', 'join.relay.test']);
          return Promise.resolve(ca.signCsr(csr, 90));
        },
      },
      log: silent,
      now: () => clock,
      onChange: () => undefined,
    });
    const first = await own.ensure();
    expect(issued).toBe(1);
    expect(statSync(join(dir, 'tls', 'relay-key.pem')).mode & 0o777).toBe(0o600);
    expect(statSync(join(dir, 'tls')).mode & 0o777).toBe(0o700);
    expect((await own.ensure()).cert).toBe(first.cert);
    expect(issued).toBe(1);
    clock += 61 * 24 * 60 * 60_000; // past two thirds of 90 days
    expect(needsRenewal(first.cert, clock)).toBe(true);
    const renewed = await own.ensure();
    expect(issued).toBe(2);
    expect(renewed.cert).not.toBe(first.cert);
    // The same key is kept.
    expect(renewed.key).toBe(first.key);
  });

  it('treats unreadable certificates as due', () => {
    expect(needsRenewal('garbage', Date.now())).toBe(true);
  });
});
