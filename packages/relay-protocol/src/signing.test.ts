import { describe, expect, it } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import { hubIdFromPublicKey } from './identity.ts';
import {
  publicKeyRaw,
  signRegistration,
  signRequest,
  signTunnelChallenge,
  verifyRegistration,
  verifyRequest,
  verifyTunnelChallenge,
} from './signing.ts';

const { privateKey } = generateKeyPairSync('ed25519');
const raw = publicKeyRaw(privateKey);
const hubId = hubIdFromPublicKey(raw);
const other = generateKeyPairSync('ed25519').privateKey;
const NOW = 1_792_330_000;

describe('tunnel challenge', () => {
  it('verifies the right signature only', () => {
    const nonce = 'n'.repeat(43);
    const sig = signTunnelChallenge(privateKey, hubId, 'relay.test', nonce);
    expect(verifyTunnelChallenge(raw, hubId, 'relay.test', nonce, sig)).toBe(true);
    expect(verifyTunnelChallenge(raw, hubId, 'relay.test', 'm'.repeat(43), sig)).toBe(false);
    expect(verifyTunnelChallenge(raw, hubId, 'other.test', nonce, sig)).toBe(false);
    expect(verifyTunnelChallenge(raw, 'zzzzzzzzzzzz', 'relay.test', nonce, sig)).toBe(false);
    expect(verifyTunnelChallenge(publicKeyRaw(other), hubId, 'relay.test', nonce, sig)).toBe(false);
    const flipped = (sig[0] === 'A' ? 'B' : 'A') + sig.slice(1);
    expect(verifyTunnelChallenge(raw, hubId, 'relay.test', nonce, flipped)).toBe(false);
    expect(verifyTunnelChallenge(raw, hubId, 'relay.test', nonce, 'short')).toBe(false);
  });
});

describe('registration', () => {
  it('proves key possession and yields the hub id', () => {
    const body = signRegistration(privateKey, NOW);
    expect(verifyRegistration(body, NOW + 10)).toEqual({ ok: true, publicKey: raw, hubId });
  });

  it('refuses skewed time, wrong proof and bad keys', () => {
    const body = signRegistration(privateKey, NOW);
    expect(verifyRegistration(body, NOW + 301)).toEqual({ ok: false, reason: 'bad_time' });
    expect(verifyRegistration({ ...body, time: NOW + 1 }, NOW)).toEqual({
      ok: false,
      reason: 'bad_signature',
    });
    const otherBody = signRegistration(other, NOW);
    expect(verifyRegistration({ ...body, publicKey: otherBody.publicKey }, NOW)).toEqual({
      ok: false,
      reason: 'bad_signature',
    });
    expect(verifyRegistration({ ...body, publicKey: 'x' }, NOW)).toEqual({
      ok: false,
      reason: 'bad_key',
    });
  });
});

describe('signed requests', () => {
  const body = Buffer.from('{"csr":"abc"}');
  const signed = () =>
    signRequest({
      privateKey,
      hubId,
      method: 'post',
      pathWithQuery: '/v1/hubs/self/certificate',
      relayDomain: 'relay.test',
      time: NOW,
      body,
    });
  const check = (
    headers: Record<string, string>,
    over: Partial<{ method: string; path: string; body: Buffer; now: number; domain: string }> = {},
    keyFor: (id: string) => Uint8Array | null = (id) => (id === hubId ? raw : null),
  ) =>
    verifyRequest(
      {
        headers,
        method: over.method ?? 'POST',
        pathWithQuery: over.path ?? '/v1/hubs/self/certificate',
        relayDomain: over.domain ?? 'relay.test',
        body: over.body ?? body,
        nowSeconds: over.now ?? NOW,
      },
      keyFor,
    );

  it('accepts a correctly signed request', () => {
    const r = check(signed());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.hubId).toBe(hubId);
  });

  it('refuses tampering, skew, unknown hubs and missing headers', () => {
    expect(check(signed(), { method: 'GET' })).toEqual({ ok: false, reason: 'bad_signature' });
    expect(check(signed(), { path: '/v1/hubs/self' })).toEqual({
      ok: false,
      reason: 'bad_signature',
    });
    expect(check(signed(), { body: Buffer.from('{}') })).toEqual({
      ok: false,
      reason: 'bad_signature',
    });
    expect(check(signed(), { domain: 'other.test' })).toEqual({
      ok: false,
      reason: 'bad_signature',
    });
    expect(check(signed(), { now: NOW + 301 })).toEqual({ ok: false, reason: 'bad_time' });
    expect(check(signed(), {}, () => null)).toEqual({ ok: false, reason: 'unknown_hub' });
    expect(check(signed(), {}, () => publicKeyRaw(other))).toEqual({
      ok: false,
      reason: 'bad_signature',
    });
    const h = signed();
    expect(check({ ...h, 'x-kchat-time': 'soon' })).toEqual({ ok: false, reason: 'missing' });
    expect(check({ 'x-kchat-hub': hubId })).toEqual({ ok: false, reason: 'missing' });
  });
});
