import { describe, expect, it } from 'vitest';
import { hash } from '@node-rs/argon2';
import {
  aadBlob,
  argon2id,
  aadColumn,
  aadWrap,
  DecryptError,
  decrypt,
  decryptString,
  derivePasswordKeys,
  deriveRecoveryKey,
  encrypt,
  encryptString,
  generateRecoveryCode,
  hkdf,
  type KdfParams,
  normalizeRecoveryCode,
  randomKey,
  randomSalt,
  randomToken,
  safeEqual,
  unwrapKey,
  wrapKey,
} from './crypto.ts';

// Cheap parameters so tests are fast; production parameters are measured separately.
const FAST: KdfParams = { m: 1024, t: 1, p: 1 };

describe('AEAD', () => {
  const key = randomKey();
  const aad = aadColumn('u1', 'messages', 'm1', 'content');

  it('round-trips text, including empty and unicode', () => {
    for (const text of ['', 'hello', 'Grüße 👋 aus München']) {
      expect(decryptString(key, encryptString(key, text, aad), aad)).toBe(text);
    }
  });

  it('uses a fresh nonce every time', () => {
    const a = encryptString(key, 'same', aad);
    const b = encryptString(key, 'same', aad);
    expect(a.equals(b)).toBe(false);
  });

  it('does not contain the plaintext', () => {
    const envelope = encryptString(key, 'very secret family text', aad);
    expect(envelope.toString('latin1')).not.toContain('secret');
  });

  it('rejects a wrong key', () => {
    const envelope = encryptString(key, 'x', aad);
    expect(() => decrypt(randomKey(), envelope, aad)).toThrow(DecryptError);
  });

  it('rejects a ciphertext moved to another row, column or user', () => {
    const envelope = encryptString(key, 'x', aad);
    expect(() => decrypt(key, envelope, aadColumn('u1', 'messages', 'm2', 'content'))).toThrow(
      DecryptError,
    );
    expect(() => decrypt(key, envelope, aadColumn('u1', 'chats', 'm1', 'title'))).toThrow(
      DecryptError,
    );
    expect(() => decrypt(key, envelope, aadColumn('u2', 'messages', 'm1', 'content'))).toThrow(
      DecryptError,
    );
  });

  it('rejects any flipped bit', () => {
    const envelope = encryptString(key, 'tamper me', aad);
    for (let i = 0; i < envelope.length; i++) {
      const copy = Buffer.from(envelope);
      copy[i] = (copy[i] ?? 0) ^ 0x01;
      expect(() => decrypt(key, copy, aad)).toThrow(DecryptError);
    }
  });

  it('rejects truncated input and unknown versions', () => {
    const envelope = encryptString(key, 'x', aad);
    expect(() => decrypt(key, envelope.subarray(0, 20), aad)).toThrow(DecryptError);
    const v2 = Buffer.from(envelope);
    v2[0] = 0x02;
    expect(() => decrypt(key, v2, aad)).toThrow(DecryptError);
  });

  it('refuses bad keys and bad AAD components', () => {
    expect(() => encrypt(Buffer.alloc(16), Buffer.from('x'), aad)).toThrow();
    expect(() => aadColumn('u1|evil', 'messages', 'm1', 'content')).toThrow();
    expect(() => aadBlob('u1', '')).toThrow();
  });

  it('error messages never contain the plaintext or key', () => {
    const envelope = encryptString(key, 'plaintext-marker', aad);
    try {
      decrypt(randomKey(), envelope, aad);
    } catch (err) {
      expect(String(err)).not.toContain('plaintext-marker');
      expect(String(err)).not.toContain(key.toString('hex'));
    }
  });
});

describe('key wrapping', () => {
  it('wraps and unwraps a data key', () => {
    const kek = randomKey();
    const dek = randomKey();
    const wrapped = wrapKey(kek, dek, aadWrap('u1', 'password'));
    expect(unwrapKey(kek, wrapped, aadWrap('u1', 'password')).equals(dek)).toBe(true);
  });

  it('cannot unwrap with the wrong slot or user', () => {
    const kek = randomKey();
    const wrapped = wrapKey(kek, randomKey(), aadWrap('u1', 'password'));
    expect(() => unwrapKey(kek, wrapped, aadWrap('u1', 'recovery'))).toThrow(DecryptError);
    expect(() => unwrapKey(kek, wrapped, aadWrap('u2', 'password'))).toThrow(DecryptError);
  });
});

describe('password keys', () => {
  it('uses Argon2id', async () => {
    const salt = randomSalt();
    const phc = await hash('pw', {
      salt,
      memoryCost: FAST.m,
      timeCost: FAST.t,
      parallelism: FAST.p,
    });
    expect(phc.startsWith('$argon2id$')).toBe(true);
    const raw = await argon2id('pw', salt, FAST, 32);
    expect(phc.split('$').pop()).toBe(raw.toString('base64').replace(/=+$/, ''));
  });

  it('is deterministic for the same password and salt', async () => {
    const salt = randomSalt();
    const a = await derivePasswordKeys('correct horse battery staple', salt, FAST);
    const b = await derivePasswordKeys('correct horse battery staple', salt, FAST);
    expect(a.kek.equals(b.kek)).toBe(true);
    expect(safeEqual(a.authHash, b.authHash)).toBe(true);
  });

  it('differs for another password or salt', async () => {
    const salt = randomSalt();
    const a = await derivePasswordKeys('correct horse battery staple', salt, FAST);
    const b = await derivePasswordKeys('correct horse battery stapl3', salt, FAST);
    const c = await derivePasswordKeys('correct horse battery staple', randomSalt(), FAST);
    expect(a.kek.equals(b.kek)).toBe(false);
    expect(a.kek.equals(c.kek)).toBe(false);
  });

  it('keeps the KEK and the login verifier independent', async () => {
    const keys = await derivePasswordKeys('correct horse battery staple', randomSalt(), FAST);
    expect(keys.kek.length).toBe(32);
    expect(keys.authHash.length).toBe(32);
    expect(keys.kek.equals(keys.authHash)).toBe(false);
  });

  it('treats NFC and NFD forms of a password as equal', async () => {
    const salt = randomSalt();
    const nfc = await derivePasswordKeys('Müller Straße'.normalize('NFC'), salt, FAST);
    const nfd = await derivePasswordKeys('Müller Straße'.normalize('NFD'), salt, FAST);
    expect(nfc.kek.equals(nfd.kek)).toBe(true);
  });
});

describe('KDF concurrency', () => {
  it('runs many derivations correctly through the limited slots', async () => {
    const salt = randomSalt();
    const outs = await Promise.all(
      Array.from({ length: 8 }, (_, i) => argon2id(`pw${String(i % 2)}`, salt, FAST, 32)),
    );
    expect(outs[0]?.equals(outs[2] ?? Buffer.alloc(0))).toBe(true);
    expect(outs[0]?.equals(outs[1] ?? Buffer.alloc(0))).toBe(false);
  });
});

describe('recovery codes', () => {
  it('generates 25 Crockford characters in groups of 5', () => {
    const code = generateRecoveryCode();
    expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{5}(-[0-9A-HJKMNP-TV-Z]{5}){4}$/);
  });

  it('generates different codes', () => {
    const codes = new Set(Array.from({ length: 50 }, () => generateRecoveryCode()));
    expect(codes.size).toBe(50);
  });

  it('normalises what people type', () => {
    const code = generateRecoveryCode();
    const canonical = code.replace(/-/g, '');
    expect(normalizeRecoveryCode(code)).toBe(canonical);
    expect(normalizeRecoveryCode(code.toLowerCase().replace(/-/g, ' '))).toBe(canonical);
    expect(normalizeRecoveryCode('oooo0-iiiil-11111-00000-22222')).toBe(
      '000001111111111000002222' + '2',
    );
  });

  it('rejects wrong length or characters', () => {
    expect(normalizeRecoveryCode('ABCDE')).toBeNull();
    expect(normalizeRecoveryCode('UUUUU-UUUUU-UUUUU-UUUUU-UUUUU')).toBeNull();
    expect(normalizeRecoveryCode('')).toBeNull();
  });

  it('derives a recovery key that unwraps the data key', async () => {
    const code = normalizeRecoveryCode(generateRecoveryCode());
    expect(code).not.toBeNull();
    const salt = randomSalt();
    const rk = await deriveRecoveryKey(code ?? '', salt, FAST);
    const dek = randomKey();
    const wrapped = wrapKey(rk, dek, aadWrap('u1', 'recovery'));
    const again = await deriveRecoveryKey(code ?? '', salt, FAST);
    expect(unwrapKey(again, wrapped, aadWrap('u1', 'recovery')).equals(dek)).toBe(true);
  });
});

describe('tokens and HKDF', () => {
  it('makes 256-bit url-safe tokens', () => {
    const t = randomToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(randomToken()).not.toBe(t);
  });

  it('separates HKDF outputs by info', () => {
    const ikm = randomKey();
    expect(hkdf(ikm, 's', 'a').equals(hkdf(ikm, 's', 'b'))).toBe(false);
    expect(hkdf(ikm, 's', 'a').equals(hkdf(ikm, 's', 'a'))).toBe(true);
  });
});
