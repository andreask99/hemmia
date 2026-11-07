import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { type Manifest, signManifest } from '@hemmia/relay-protocol';
import { createUpdateCheck, isNewer, parseSemver } from './updates.ts';

function keys() {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  return {
    pem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    raw: publicKey.export({ format: 'jwk' }).x ?? '',
  };
}

const MANIFEST: Manifest = {
  v: 1,
  channel: 'stable',
  signedAt: 1000,
  latest: {
    version: '0.2.0',
    date: '2026-11-07',
    major: false,
    notesUrl: 'https://hemmia.app/releases/0.2.0',
    files: {},
  },
  minimum: null,
};

function serve(bodies: unknown[]) {
  const urls: string[] = [];
  let i = 0;
  const fetchImpl: typeof fetch = (input) => {
    urls.push(input instanceof Request ? input.url : input.toString());
    const body = bodies[Math.min(i++, bodies.length - 1)];
    return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
  };
  return { urls, fetch: fetchImpl };
}

describe('update check', () => {
  it('compares versions', () => {
    expect(parseSemver('v1.2.3')).toEqual([1, 2, 3]);
    expect(parseSemver('1.2')).toBeNull();
    expect(isNewer('v0.2.0', '0.1.9')).toBe(true);
    expect(isNewer('0.1.9', '0.2.0')).toBe(false);
    expect(isNewer('0.1.0', '0.1.0')).toBe(false);
    expect(isNewer('nonsense', '0.1.0')).toBe(false);
  });

  it('reports a newer release from a signed manifest, sending only version, platform, channel', async () => {
    const k = keys();
    const s = serve([signManifest(MANIFEST, k.pem)]);
    const check = createUpdateCheck({
      relayDomain: 'relay.test',
      currentVersion: '0.1.0',
      platform: 'mac',
      fetch: s.fetch,
      publicKey: k.raw,
    });
    expect(await check.check()).toEqual({
      version: '0.2.0',
      url: 'https://hemmia.app/releases/0.2.0',
      major: false,
      belowMinimum: false,
    });
    expect(s.urls).toEqual(['https://api.relay.test/v1/manifest?v=0.1.0&p=mac&c=stable']);
  });

  it('ignores manifests signed with another key or changed after signing', async () => {
    const k = keys();
    const other = keys();
    const forged = signManifest(MANIFEST, other.pem);
    const good = signManifest(MANIFEST, k.pem);
    const changed = signManifest({ ...MANIFEST, latest: { ...MANIFEST.latest } }, k.pem);
    const tampered = {
      ...changed,
      payload: Buffer.from(
        Buffer.from(changed.payload, 'base64url').toString().replace('hemmia.app', 'evil.example'),
      ).toString('base64url'),
    };
    for (const body of [forged, tampered, { payload: good.payload }]) {
      const check = createUpdateCheck({
        relayDomain: 'relay.test',
        currentVersion: '0.1.0',
        platform: 'mac',
        fetch: serve([body]).fetch,
        publicKey: k.raw,
      });
      expect(await check.check()).toBeNull();
    }
  });

  it('warns below the minimum, and ignores an older manifest replayed later', async () => {
    const k = keys();
    const newer = signManifest({ ...MANIFEST, signedAt: 2000, minimum: '0.1.5' }, k.pem);
    const older = signManifest(MANIFEST, k.pem);
    const check = createUpdateCheck({
      relayDomain: 'relay.test',
      currentVersion: '0.1.0',
      platform: 'docker',
      fetch: serve([newer, older]).fetch,
      publicKey: k.raw,
    });
    const first = await check.check();
    expect(first?.belowMinimum).toBe(true);
    expect(await check.check()).toEqual(first);
  });

  it('shows nothing when up to date, and checks nothing without a relay', async () => {
    const k = keys();
    const current = createUpdateCheck({
      relayDomain: 'relay.test',
      currentVersion: '0.2.0',
      platform: 'mac',
      fetch: serve([signManifest(MANIFEST, k.pem)]).fetch,
      publicKey: k.raw,
    });
    expect(await current.check()).toBeNull();
    const s = serve([signManifest(MANIFEST, k.pem)]);
    const none = createUpdateCheck({
      relayDomain: null,
      currentVersion: '0.1.0',
      platform: 'mac',
      fetch: s.fetch,
    });
    expect(await none.check()).toBeNull();
    expect(s.urls).toEqual([]);
  });
});
