import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildCsr } from './csr.ts';

const hasOpenssl = (() => {
  try {
    execFileSync('openssl', ['version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

describe('buildCsr', () => {
  it.skipIf(!hasOpenssl)('builds a CSR that OpenSSL verifies, with the SAN names', () => {
    const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const der = buildCsr(privateKey, ['zt0jr4qknd6e.h.relay.test']);
    const dir = mkdtempSync(join(tmpdir(), 'csr-'));
    try {
      writeFileSync(join(dir, 'r.der'), der);
      const out = execFileSync(
        'openssl',
        ['req', '-inform', 'DER', '-in', 'r.der', '-verify', '-noout', '-text'],
        {
          cwd: dir,
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      ).toString();
      expect(out).toContain('CN=zt0jr4qknd6e.h.relay.test');
      expect(out).toContain('DNS:zt0jr4qknd6e.h.relay.test');
      expect(out).toContain('ecdsa-with-SHA256');
      const many = buildCsr(privateKey, ['api.relay.test', 'tunnel.relay.test', 'join.relay.test']);
      writeFileSync(join(dir, 'm.der'), many);
      const text = execFileSync(
        'openssl',
        ['req', '-inform', 'DER', '-in', 'm.der', '-verify', '-noout', '-text'],
        {
          cwd: dir,
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      ).toString();
      expect(text).toContain('DNS:api.relay.test, DNS:tunnel.relay.test, DNS:join.relay.test');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('refuses other keys and bad names', () => {
    const ed = generateKeyPairSync('ed25519').privateKey;
    expect(() => buildCsr(ed, ['a.test'])).toThrow(TypeError);
    const ec = generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey;
    expect(() => buildCsr(ec, [])).toThrow(RangeError);
    expect(() => buildCsr(ec, ['Upper.Test'])).toThrow(RangeError);
    expect(() => buildCsr(ec, ['a.test', 'bad name'])).toThrow(RangeError);
  });
});
