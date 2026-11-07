import { describe, expect, it } from 'vitest';
import { createPrivateKey } from 'node:crypto';
import { hubHostname, hubIdFromPublicKey, hubIdOfHost, isHubHost } from './identity.ts';
import { publicKeyRaw } from './signing.ts';

/** Ed25519 key from a fixed seed (32 × 0x07), so the vector below never changes. */
export function fixedKey() {
  return createPrivateKey({
    key: Buffer.concat([
      Buffer.from('302e020100300506032b657004220420', 'hex'),
      Buffer.alloc(32, 7),
    ]),
    format: 'der',
    type: 'pkcs8',
  });
}

describe('hub identity', () => {
  it('derives the fixed hub id of a fixed key', () => {
    const raw = publicKeyRaw(fixedKey());
    expect(Buffer.from(raw).toString('hex')).toBe(
      'ea4a6c63e29c520abef5507b132ec5f9954776aebebe7b92421eea691446d22c',
    );
    expect(hubIdFromPublicKey(raw)).toBe('zt0jr4qknd6e');
  });

  it('refuses keys of the wrong length', () => {
    expect(() => hubIdFromPublicKey(new Uint8Array(31))).toThrow(RangeError);
  });

  it('recognises hub hosts of one relay domain only', () => {
    expect(isHubHost('zt0jr4qknd6e.h.relay.test', 'relay.test')).toBe(true);
    expect(isHubHost('ZT0JR4QKND6E.H.Relay.Test', 'relay.test')).toBe(true);
    expect(isHubHost('zt0jr4qknd6e.h.other.test', 'relay.test')).toBe(false);
    expect(isHubHost('zt0jr4qknd6.h.relay.test', 'relay.test')).toBe(false);
    expect(isHubHost('zt0jr4qknd6u.h.relay.test', 'relay.test')).toBe(false); // 'u' not in alphabet
    expect(isHubHost('x.zt0jr4qknd6e.h.relay.test', 'relay.test')).toBe(false);
    expect(hubHostname('zt0jr4qknd6e', 'relay.test')).toBe('zt0jr4qknd6e.h.relay.test');
    expect(hubIdOfHost('zt0jr4qknd6e.h.relay.test', 'relay.test')).toBe('zt0jr4qknd6e');
    expect(hubIdOfHost('api.relay.test', 'relay.test')).toBeNull();
  });
});
